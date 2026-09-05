from __future__ import annotations

from typing import Any, Protocol

import httpx

from app.domain.audience_pulse import MAX_AUDIENCE_COMMENTS, YouTubeVideoSnapshot
from app.services.audience_pulse_errors import YouTubeClientError, YouTubeErrorCode
from app.services.audience_pulse_normalize import parse_youtube_video_id


class _AsyncHttpClient(Protocol):
    async def get(self, url: str, *, params: dict[str, Any] | None = None) -> httpx.Response: ...

    async def aclose(self) -> None: ...


class YouTubeDataClient:
    """Public YouTube Data API v3 client (API key only, no OAuth)."""

    def __init__(
        self,
        *,
        api_key: str | None,
        timeout_seconds: float = 20.0,
        http_client: _AsyncHttpClient | None = None,
    ) -> None:
        self._api_key = api_key.strip() if api_key and api_key.strip() else None
        self._timeout_seconds = timeout_seconds
        self._http = http_client
        self._owns_http = http_client is None

    def require_configured(self) -> None:
        if self._api_key is None:
            raise YouTubeClientError(
                YouTubeErrorCode.NOT_CONFIGURED,
                "YouTube comment retrieval is not configured on this server.",
            )

    async def fetch_public_comments(
        self,
        youtube_url: str,
    ) -> tuple[YouTubeVideoSnapshot, list[tuple[str, str | None]]]:
        self.require_configured()
        assert self._api_key is not None
        video_id = parse_youtube_video_id(youtube_url)
        client = await self._client()
        try:
            snapshot = await self._fetch_video(client, video_id)
            comments = await self._fetch_comment_threads(client, video_id)
            return snapshot, comments
        finally:
            if self._owns_http:
                await client.aclose()

    async def _client(self) -> _AsyncHttpClient:
        if self._http is not None:
            return self._http
        return httpx.AsyncClient(timeout=self._timeout_seconds)

    async def _fetch_video(
        self,
        client: _AsyncHttpClient,
        video_id: str,
    ) -> YouTubeVideoSnapshot:
        assert self._api_key is not None
        response = await client.get(
            "https://www.googleapis.com/youtube/v3/videos",
            params={
                "part": "snippet,statistics",
                "id": video_id,
                "key": self._api_key,
            },
        )
        payload = self._parse_json(response)
        items = payload.get("items")
        if not isinstance(items, list) or not items:
            raise YouTubeClientError(
                YouTubeErrorCode.VIDEO_NOT_FOUND,
                "The YouTube video was not found or is not public.",
            )
        item = items[0]
        if not isinstance(item, dict):
            raise YouTubeClientError(
                YouTubeErrorCode.UNAVAILABLE,
                "YouTube returned an unexpected video payload.",
            )
        snippet = item.get("snippet") if isinstance(item.get("snippet"), dict) else {}
        statistics = (
            item.get("statistics") if isinstance(item.get("statistics"), dict) else {}
        )
        title = str(snippet.get("title") or "").strip() or "Untitled video"
        channel = str(snippet.get("channelTitle") or "").strip() or "Unknown channel"
        comment_count: int | None = None
        raw_count = statistics.get("commentCount")
        if isinstance(raw_count, str) and raw_count.isdigit():
            comment_count = int(raw_count)
        elif isinstance(raw_count, int) and raw_count >= 0:
            comment_count = raw_count
        return YouTubeVideoSnapshot(
            id=video_id,
            title=title[:300],
            channel_title=channel[:200],
            comment_count_public=comment_count,
        )

    async def _fetch_comment_threads(
        self,
        client: _AsyncHttpClient,
        video_id: str,
    ) -> list[tuple[str, str | None]]:
        assert self._api_key is not None
        collected: list[tuple[str, str | None]] = []
        page_token: str | None = None
        while len(collected) < MAX_AUDIENCE_COMMENTS:
            params: dict[str, Any] = {
                "part": "snippet",
                "videoId": video_id,
                "maxResults": min(100, MAX_AUDIENCE_COMMENTS - len(collected)),
                "order": "relevance",
                "textFormat": "plainText",
                "key": self._api_key,
            }
            if page_token:
                params["pageToken"] = page_token
            response = await client.get(
                "https://www.googleapis.com/youtube/v3/commentThreads",
                params=params,
            )
            if response.status_code == 403:
                self._raise_comments_forbidden(response)
            payload = self._parse_json(response)
            items = payload.get("items")
            if not isinstance(items, list):
                break
            for item in items:
                if not isinstance(item, dict):
                    continue
                thread = item.get("snippet")
                if not isinstance(thread, dict):
                    continue
                top = thread.get("topLevelComment")
                if not isinstance(top, dict):
                    continue
                top_snippet = top.get("snippet")
                if not isinstance(top_snippet, dict):
                    continue
                text = top_snippet.get("textDisplay") or top_snippet.get("textOriginal")
                if not isinstance(text, str) or not text.strip():
                    continue
                author = top_snippet.get("authorDisplayName")
                author_str = author if isinstance(author, str) else None
                collected.append((text, author_str))
                if len(collected) >= MAX_AUDIENCE_COMMENTS:
                    break
            next_token = payload.get("nextPageToken")
            if not isinstance(next_token, str) or not next_token:
                break
            page_token = next_token
        return collected

    def _parse_json(self, response: httpx.Response) -> dict[str, Any]:
        if response.status_code == 401:
            raise YouTubeClientError(
                YouTubeErrorCode.AUTHENTICATION,
                "YouTube rejected the API key.",
            )
        if response.status_code == 403:
            self._raise_comments_forbidden(response)
        if response.status_code == 404:
            raise YouTubeClientError(
                YouTubeErrorCode.VIDEO_NOT_FOUND,
                "The YouTube video was not found or is not public.",
            )
        if response.status_code >= 500:
            raise YouTubeClientError(
                YouTubeErrorCode.UNAVAILABLE,
                "YouTube is temporarily unavailable.",
            )
        if response.status_code >= 400:
            raise YouTubeClientError(
                YouTubeErrorCode.UNAVAILABLE,
                "YouTube request failed.",
            )
        try:
            payload = response.json()
        except ValueError as error:
            raise YouTubeClientError(
                YouTubeErrorCode.UNAVAILABLE,
                "YouTube returned a non-JSON response.",
            ) from error
        if not isinstance(payload, dict):
            raise YouTubeClientError(
                YouTubeErrorCode.UNAVAILABLE,
                "YouTube returned an unexpected payload.",
            )
        return payload

    def _raise_comments_forbidden(self, response: httpx.Response) -> None:
        try:
            payload = response.json()
        except ValueError:
            payload = {}
        error = payload.get("error") if isinstance(payload, dict) else None
        errors = error.get("errors") if isinstance(error, dict) else None
        reasons: list[str] = []
        if isinstance(errors, list):
            for item in errors:
                if isinstance(item, dict) and isinstance(item.get("reason"), str):
                    reasons.append(item["reason"])
        joined = " ".join(reasons).lower()
        if "quota" in joined or "dailyLimitExceeded" in reasons or "quotaExceeded" in reasons:
            raise YouTubeClientError(
                YouTubeErrorCode.QUOTA_EXCEEDED,
                "YouTube API quota was exceeded.",
            )
        if (
            "commentsDisabled" in reasons
            or "disabled" in joined
            or "forbidden" in joined
        ):
            raise YouTubeClientError(
                YouTubeErrorCode.COMMENTS_DISABLED,
                "Comments are disabled or unavailable for this video.",
            )
        if "keyInvalid" in reasons or "auth" in joined:
            raise YouTubeClientError(
                YouTubeErrorCode.AUTHENTICATION,
                "YouTube rejected the API key.",
            )
        raise YouTubeClientError(
            YouTubeErrorCode.UNAVAILABLE,
            "YouTube denied the comment request.",
        )
