import { KEY_PREFIX } from './constants'
import createAsyncLocalStorage from './defaults/asyncLocalStorage'

export default function getStoredState (config, onComplete) {
  let storage = config.storage || createAsyncLocalStorage('local')
  const deserializer = config.serialize === false ? (data) => data : defaultDeserializer
  const blacklist = config.blacklist || []
  const whitelist = config.whitelist || false
  const transforms = config.transforms || []
  const keyPrefix = config.keyPrefix !== undefined ? config.keyPrefix : KEY_PREFIX
  const commonKeys = config.commonKeys || []
  const commonKeysPrefix = config.commonKeysPrefix || 'common'
  const dynPrefix = config.dynPrefix || '@garbage'

  // fallback getAllKeys to `keys` if present (LocalForage compatability)
  if (storage.keys && !storage.getAllKeys) storage = {...storage, getAllKeys: storage.keys}

  let restoredState = {}
  let completionCount = 0

  storage.getAllKeys((err, allKeys) => {
    if (err) {
      if (process.env.NODE_ENV !== 'production') console.warn('redux-persist/getStoredState: Error in storage.getAllKeys')
      complete(err)
    }

    let persistKeys = extractKeys(allKeys)
    let keysToRestore = persistKeys.filter(passWhitelistBlacklist)

    let restoreCount = keysToRestore.length
    if (restoreCount === 0) complete(null, restoredState)
    keysToRestore.forEach((key) => {
      storage.getItem(createStorageKey(key), (err, serialized) => {
        if (err && process.env.NODE_ENV !== 'production') console.warn('redux-persist/getStoredState: Error restoring data for key:', key, err)
        else restoredState[key] = rehydrate(key, serialized)
        completionCount += 1
        if (completionCount === restoreCount) complete(null, restoredState)
      })
    })
  })

  function rehydrate (key, serialized) {
    let state = null

    try {
      let data = deserializer(serialized)
      state = transforms.reduceRight((subState, transformer) => {
        return transformer.out(subState, key)
      }, data)
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') console.warn('redux-persist/getStoredState: Error restoring data for key:', key, err)
    }

    return state
  }

  function complete (err, restoredState) {
    onComplete(err, restoredState)
  }

  function passWhitelistBlacklist (key) {
    if (whitelist && whitelist.indexOf(key) === -1) return false
    if (blacklist.indexOf(key) !== -1) return false
    return true
  }

  function extractKeys (allKeys) {
    const keys = []
    const common = `${keyPrefix}${commonKeysPrefix}:`
    const dyn = `${keyPrefix}@${dynPrefix}:`

    allKeys.forEach(key => {
      if (key.startsWith(common)) {
        keys.push(key.slice(common.length))
      } else if (key.startsWith(dyn)) {
        keys.push(key.slice(dyn.length))
      }
    })

    return keys
  }

  function createStorageKey (key) {
    if(commonKeys.includes(key))
      return `${keyPrefix}${commonKeysPrefix}:${key}`
    else
      return `${keyPrefix}@${dynPrefix}:${key}`
  }

  if (typeof onComplete !== 'function' && !!Promise) {
    return new Promise((resolve, reject) => {
      onComplete = (err, restoredState) => {
        if (err) reject(err)
        else resolve(restoredState)
      }
    })
  }
}

function defaultDeserializer (serial) {
  return JSON.parse(serial)
}
