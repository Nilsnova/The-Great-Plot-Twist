// One public label for title HTML, Settings, the world badge and performance copies.
export function formatBuildStamp(stamp) {
  return `Build ${stamp.sha}${stamp.environment ? ` · ${stamp.environment}` : ''}`;
}

export function performanceCopy(stamp, numbers) {
  return `${formatBuildStamp(stamp)}\nBuilt at: ${stamp.builtAt}\n${numbers}`;
}
