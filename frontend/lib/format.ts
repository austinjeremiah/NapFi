export function shortAddress(addr: string, left = 6, right = 4) {
  if (!addr || addr.length < left + right + 2) return addr
  return `${addr.slice(0, left)}...${addr.slice(-right)}`
}
