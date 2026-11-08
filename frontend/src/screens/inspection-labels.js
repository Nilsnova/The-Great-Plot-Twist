// Human-readable formatting of supplied identifiers; no location or story lookup is added.
export function inspectionLabel(value) {
  const text=String(value??'');
  if(!/^[a-z\d_]+(?:\.[a-z\d_]+)*$/.test(text))return text;
  return text.split('.').map(part=>{const words=part.replaceAll('_',' ');return words.charAt(0).toUpperCase()+words.slice(1);}).join(' · ');
}
