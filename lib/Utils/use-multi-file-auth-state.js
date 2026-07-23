"use strict"

var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod }
}

Object.defineProperty(exports, "__esModule", { value: true })

const async_mutex_1 = __importDefault(require("async-mutex"))
const promises_1 = require("fs/promises")
const path_1 = require("path")
const WAProto_1 = require("../../WAProto")
const auth_utils_1 = require("./auth-utils")
const generics_1 = require("./generics")
// We need to lock files due to the fact that we are using async functions to read and write files
// https://github.com/WhiskeySockets/Baileys/issues/794
// https://github.com/nodejs/node/issues/26338
// Use a Map to store mutexes for each file path
const fileLocks = new Map()

// ── CiaaTopUpbail: Performance – In-memory read cache (500ms TTL) ─────────────────
// Prevents redundant disk reads for the same key within a single event-loop burst.
const readCache = new Map()
const READ_CACHE_TTL = 500 // ms
const getReadCache = (key) => {
    const entry = readCache.get(key)
    if (entry && Date.now() - entry.ts < READ_CACHE_TTL) return entry.value
    return undefined
}
const setReadCache = (key, value) => {
    readCache.set(key, { value, ts: Date.now() })
}
const invalidateReadCache = (key) => readCache.delete(key)

// ── CiaaTopUpbail: Write-debounce for high-frequency keys ─────────────────────────
// sender-key-memory and device-list are written on EVERY group message.
// Debouncing 200ms collapses burst writes into a single disk operation.
const DEBOUNCE_KEYS = new Set(['sender-key-memory', 'device-list'])
const writeDebounce = new Map() // filePath -> { data, timer }
const flushDebouncedWrite = async (filePath, writeDataFn) => {
    const pending = writeDebounce.get(filePath)
    if (!pending) return
    writeDebounce.delete(filePath)
    await writeDataFn(pending.data, filePath, true)
}

// Get or create a mutex for a specific file path
const getFileLock = (path) => {
	let mutex = fileLocks.get(path)
	if (!mutex) {
		mutex = new async_mutex_1.Mutex()
		fileLocks.set(path, mutex)
		// CiaaTopUpbail: Cleanup – trim fileLocks if it grows too large (long-running bots)
		if (fileLocks.size > 500) {
			for (const [k, m] of fileLocks) {
				if (!m.isLocked()) {
					fileLocks.delete(k)
					if (fileLocks.size <= 400) break
				}
			}
		}
	}

	return mutex
}

/**
 * stores the full authentication state in a single folder.
 * Far more efficient than singlefileauthstate
 *
 * Again, I wouldn't endorse this for any production level use other than perhaps a bot.
 * Would recommend writing an auth state for use with a proper SQL or No-SQL DB
 * */
const useMultiFileAuthState = async (folder) => {
    const fixFileName = (file) => file?.replace(/\//g, '__')?.replace(/:/g, '-')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const writeData = async (data, file, _direct = false) => {
        const filePath = _direct ? file : path_1.join(folder, fixFileName(file))
        // CiaaTopUpbail: Invalidate read cache on write
        invalidateReadCache(filePath)
        const mutex = getFileLock(filePath)
        return mutex.acquire().then(async (release) => {
            try {
               await promises_1.writeFile(filePath, JSON.stringify(data, generics_1.BufferJSON.replacer))
            } finally {
                release()
            }
        })
    }
    const readData = async (file) => {
        try {
            const filePath = path_1.join(folder, fixFileName(file))
            // CiaaTopUpbail: Fast path – check in-memory read cache first
            const cached = getReadCache(filePath)
            if (cached !== undefined) return cached
            const mutex = getFileLock(filePath)
            const data = await mutex.acquire().then(async (release) => {
                try {
                    return await promises_1.readFile(filePath, { encoding: 'utf-8' })
                } finally {
                    release()
                }
            })
            const parsed = JSON.parse(data, generics_1.BufferJSON.reviver)
            setReadCache(filePath, parsed)
            return parsed
        } catch (error) {
            return null
        }
    }
    const removeData = async (file) => {
        try {
            const filePath = path_1.join(folder, fixFileName(file))
            invalidateReadCache(filePath)
            const mutex = getFileLock(filePath)
            await mutex.acquire().then(async (release) => {
               try {
                    await promises_1.unlink(filePath)
                } finally {
                    release()
                }
            })
        } catch {}
    }
    const folderInfo = await promises_1.stat(folder).catch(() => { })
    if (folderInfo) {
        if (!folderInfo.isDirectory()) {
            throw new Error(`found something that is not a directory at ${folder}, either delete it or specify a different location`)
        }
    }
    else {
        await promises_1.mkdir(folder, { recursive: true })
    }
    const creds = await readData('creds.json') || auth_utils_1.initAuthCreds()
    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {}
                    await Promise.all(ids.map(async (id) => {
                        let value = await readData(`${type}-${id}.json`)
                        if (type === 'app-state-sync-key' && value) {
                            value = WAProto_1.proto.Message.AppStateSyncKeyData.fromObject(value)
                        }
                        data[id] = value
                    }))
                    return data
                },
                set: async (data) => {
                    const tasks = []
                    for (const category in data) {
                        for (const id in data[category]) {
                            const value = data[category][id]
                            const file = `${category}-${id}.json`
                            if (!value) {
                                tasks.push(removeData(file))
                                continue
                            }
                            // CiaaTopUpbail: Write debounce for high-frequency non-critical keys
                            if (DEBOUNCE_KEYS.has(category)) {
                                const filePath = path_1.join(folder, fixFileName(file))
                                const existing = writeDebounce.get(filePath)
                                if (existing) {
                                    clearTimeout(existing.timer)
                                }
                                const timer = setTimeout(() => flushDebouncedWrite(filePath, writeData), 200)
                                writeDebounce.set(filePath, { data: value, timer })
                                // Also update read cache immediately so reads in current
                                // burst see the latest value without waiting for disk flush
                                setReadCache(filePath, value)
                            } else {
                                tasks.push(writeData(value, file))
                            }
                        }
                    }
                    await Promise.all(tasks)
                }
            }
        },
        saveCreds: async () => {
            return writeData(creds, 'creds.json')
        }
    }
}

module.exports = {
  useMultiFileAuthState
}