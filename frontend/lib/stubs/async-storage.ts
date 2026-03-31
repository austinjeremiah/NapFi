/**
 * Browser stub for @react-native-async-storage/async-storage.
 * MetaMask SDK references it; web builds do not ship React Native.
 */
const memory = new Map<string, string>()
export default {
  getItem: async (key: string) => memory.get(key) ?? null,
  setItem: async (key: string, value: string) => {
    memory.set(key, value)
  },
  removeItem: async (key: string) => {
    memory.delete(key)
  },
  clear: async () => {
    memory.clear()
  },
}
