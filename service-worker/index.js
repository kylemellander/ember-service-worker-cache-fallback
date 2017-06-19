import { PATTERNS, VERSION } from 'ember-service-worker-smart-jsonapi-caching/service-worker/config'
import 'ember-service-worker-smart-jsonapi-caching/service-worker/localforage'
import {
  createUrlRegEx,
  urlMatchesAnyPattern
} from 'ember-service-worker/service-worker/url-utils'

const CACHE_KEY_PREFIX = 'esw-cache-fallback-localforage'
const CACHE_NAME = `${CACHE_KEY_PREFIX}-${VERSION}`

const PATTERN_REGEX = PATTERNS.map(createUrlRegEx)
let fetchStatus

self.addEventListener('fetch', event => {
  let request = event.request
  const clientId = event.clientId
  if (!/^https?/.test(request.url)) {
    return
  }

  if (urlMatchesAnyPattern(request.url, PATTERN_REGEX)) {
    event.respondWith(buildResponseFromCache(request)
      .then(response => {
        if (response) {
          return response
        }

        fetchStatus = 'fetching'
        return fetch(request)
          .then(response => saveResponse(request, response))
      })
    )
    event.waitUntil(lazyFetch(request, clientId))
  }
})

self.addEventListener('message', event => {
  if (event.data.clear) {
    return clearCache()
  }

  if (event.data.type && event.data.id) {
    return updateRecord(event.data)
  }
})

const clearCache = () => self.localforage.clear()

const updateRecord = record =>
  self.localforage.setItem(recordKey(record), record)

const lazyFetch = (request, clientId) => {
  let client
  const start = Date.now()
  let end = Date.now()
  const timeout = 500
  while(!fetchStatus && end - start < timeout) {
    end = Date.now()
  }

  if (fetchStatus === 'fetching' || end - start > timeout) {
    return
  }

  return self.clients.get(clientId)
    .then(foundClient => {
      client = foundClient
      client.postMessage({ loading: true })
    })
    .then(() => fetch(request))
    .then(response => saveResponse(request, response))
    .then(response => response.json())
    .then(response => client.postMessage(response))
    .catch(() => client.postMessage({ fetchFailed: true }))
}

const saveResponse = (request, response) =>
  response.clone().text().then(raw => {
    const payload = JSON.parse(raw)
    const { data, included } = payload

    if (Array.isArray(data)) {
      data.forEach(record => {
        saveRecord(recordKey(record), record)
      })
    } else if (data) {
      saveRecord(recordKey(data), data)
    }

    if (Array.isArray(included)) {
      included.forEach(record => {
        saveRecord(recordKey(record), record)
      })
    }

    if (request.method === 'GET' && response.ok) {
      saveRequest(request, response, payload)
    }
  }).then(() => response)

const recordKey = record => `${CACHE_NAME}-${record.type}[${record.id}]`
const saveRecord = (key, value) => self.localforage.setItem(key, value)

const saveRequest = (request, response, payload) => {
  const data = {
    status: response.status,
    statusText: response.statusText,
    headers: {},
    payload: formatPayloadForCaching(payload)
  }

  response.headers.forEach((value, key) => data.headers[key] = value)

  saveRecord(request.url, data)
}

const formatPayloadForCaching = payload => {
  const { data, included } = payload
  const formattedPayload = Object.assign({}, payload)

  if (Array.isArray(data)) {
    formattedPayload.data = data.map(record => `${record.type}[${record.id}]`)
  } else if (data) {
    formattedPayload.data = `${data.type}[${data.id}]`
  }

  if (Array.isArray(included)) {
    const formattedIncluded = included.map(record =>
      `${record.type}[${record.id}]`
    )

    formattedPayload.included = formattedIncluded
  }

  return formattedPayload
}

const buildResponseFromCache = request => self.localforage.getItem(request.url)
  .then(populateRecords)
  .then(populateIncludes)
  .then(cache => createResponse(cache, request))

const populateRecords = (cache, i = 0) => {
  if (!cache || !cache.payload || !cache.payload.data) {
    return
  }
  const populatedCache = Object.assign({}, cache)
  const payload = populatedCache.payload || {}
  const { data } = payload

  if (Array.isArray(data)) {
    if (i === data.length) {
      return populatedCache
    }

    return self.localforage.getItem(`${CACHE_NAME}-${data[i]}`).then(record => {
      populatedCache.payload.data[i] = record
      return populateRecords(populatedCache, i + 1)
    })
  }

  return self.localforage.getItem(`${CACHE_NAME}-${data}`).then(record => {
    populatedCache.payload.data = record
    return populatedCache
  })
}

const populateIncludes = (cache, i = 0) => {
  if (!cache) {
    return
  }

  const populatedCache = Object.assign({}, cache)
  const payload = populatedCache.payload || {}
  const { includes } = payload

  if (!Array.isArray(includes) || i === includes.length) {
    return cache
  }

  return self.localforage.getItem(`${CACHE_NAME}-${includes[i]}`)
    .then(record => {
      populatedCache.payload.includes[i] = record
      return populateIncludes(populatedCache, i + 1)
    })
}

const createResponse = (cache, request) => {
  if (!cache) {
    return
  }

  const params = {
    status: cache.status,
    statusText: cache.statusText,
    headers: cache.headers,
    url: request.url
  }

  return new Response(JSON.stringify(cache.payload), params)
}
