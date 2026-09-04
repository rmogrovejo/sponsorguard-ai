export function formatTimestamp(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "--:--";
  }

  const wholeSeconds = Math.floor(seconds);
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const remainingSeconds = wholeSeconds % 60;
  const minuteText = minutes.toString().padStart(2, "0");
  const secondText = remainingSeconds.toString().padStart(2, "0");

  if (hours > 0) {
    return `${hours.toString().padStart(2, "0")}:${minuteText}:${secondText}`;
  }

  return `${minuteText}:${secondText}`;
}

export function formatTimestampPrecise(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "--:--";
  }
  const totalHundredths = Math.round(seconds * 100);
  const wholeSeconds = Math.floor(totalHundredths / 100);
  const hundredths = totalHundredths % 100;
  return `${formatTimestamp(wholeSeconds)}.${hundredths.toString().padStart(2, "0")}`;
}
