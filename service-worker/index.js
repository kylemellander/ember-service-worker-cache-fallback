import { PATTERNS, VERSION } from 'ember-service-worker-cache-fallback/service-worker/config';
import 'ember-service-worker-cache-fallback/service-worker/localforage';
import cleanupCaches from 'ember-service-worker/service-worker/cleanup-caches';
import { createUrlRegEx, urlMatchesAnyPattern } from 'ember-service-worker/service-worker/url-utils';

const CACHE_KEY_PREFIX = 'esw-cache-fallback-localforage';
const CACHE_NAME = `${CACHE_KEY_PREFIX}-${VERSION}`;

const PATTERN_REGEX = PATTERNS.map(createUrlRegEx);

self.addEventListener('fetch', event => {
  let request = event.request
  if (!/^https?/.test(request.url)) {
    return
  }

  if (urlMatchesAnyPattern(request.url, PATTERN_REGEX)) {
    event.respondWith(buildResponseFromCache(request)
      .then(() => lazyFetch(request, event.source))
      .catch(
        () => fetch(request).then(response => saveResponse(request, response))
      )
    )
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

const updateRecord = record => self.localforage.setItem(
  `${CACHE_NAME}-${record.type}[${record.id}]`,
  record.payload
)

const lazyFetch = (request, client) => {
  fetch(request)
    .then(response => saveResponse(request, response))
    .then(response => response.json())
    .then(response => { client.postMessage(response)})
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
        saveRecord(recordKey(data), data)
      })
    }

    if (request.method === 'GET' && response.ok) {
      saveRequest(request, response, payload)
    }
  }).then(() => response)

const recordKey = record => `${CACHE_NAME}-${record.type}[${record.id}]`
const saveRecord = (key, value) => self.localforage.setItem(key, value)
const checkCachedValue = cache => cache ? cache : Promise.reject()

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
  .then(checkCachedValue)
  .then(populateRecords)
  .then(populateIncludes)
  .then(cache => createResponse(cache, request))


const populateRecords = (cache, i = 0) => {
  const populatedCache = Object.assign({}, cache)
  const payload = populatedCache.payload || {}
  const { data } = payload

  if (!data) {
    return cache
  }

  if (Array.isArray(data)) {
    if (i === data.length) {
      return populatedCache
    }

    return self.localforage.getItem(`${CACHE_NAME}-${data[i]}`).then(record => {
      populatedCache.payload.data[i] = record
      return populateRecords(populatedCache, i++)
    })
  }

  return self.localforage.getItem(`${CACHE_NAME}-${data}`).then(record => {
    populatedCache.payload.data = record
    return populatedCache
  })
}

const populateIncludes = (cache, i = 0) => {
  const populatedCache = Object.assign({}, cache)
  const payload = populatedCache.payload || {}
  const { includes } = payload

  if (!Array.isArray(includes) || i === includes.length) {
    return cache
  }

  return self.localforage.getItem(`${CACHE_NAME}-${includes[i]}`)
    .then(record => {
      populatedCache.payload.includes[i] = record
      return populateRecords(populatedCache, i++)
    })
}

const createResponse = (cache, request) => {
  const params = {
    status: cache.status,
    statusText: cache.statusText,
    headers: cache.headers,
    url: request.url
  }

  return new Response(JSON.stringify(cache.payload), params)
}
