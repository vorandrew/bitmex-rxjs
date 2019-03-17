import 'dotenv/config'

import crypto from 'crypto'
import got from 'got'
import qs from 'querystring'
import Debug from 'debug'

import { Subject, from, concat, timer } from 'rxjs'
import { distinctUntilChanged, share, tap, switchMap, skip } from 'rxjs/operators'

import BitMEXClient from 'bitmex-realtime-api'

const BITMEX_API_KEY = process.env.BITMEX_API_KEY
const BITMEX_API_SECRET = process.env.BITMEX_API_SECRET

const client = new BitMEXClient({
  apiKeyID: process.env.BITMEX_API_KEY || null,
  apiKeySecret: process.env.BITMEX_API_SECRET || null,
})

const gotClient = got.extend({
  baseUrl: 'https://www.bitmex.com',
  headers: {
    'content-type': 'application/json',
    Accept: 'application/json',
    'api-key': BITMEX_API_KEY,
  },
})

const debugOrders = Debug('bitmex-rxjs:orders')
const debugOrderEvents = Debug('bitmex-rxjs:order_events')
const debugPosition = Debug('bitmex-rxjs:position')
const debugPrice = Debug('bitmex-rxjs:price')

const priceTmp = new Subject()
const positionTmp = new Subject()
const orderEvents = new Subject()

client.addStream('XBTUSD', 'order', data => orderEvents.next(data))

client.addStream('XBTUSD', 'quote', data => {
  const len = data.length
  priceTmp.next({ bid: data[len - 1].bidPrice, ask: data[len - 1].askPrice })
})

client.addStream('XBTUSD', 'position', data => {
  const { avgEntryPrice: price, currentQty: qua } = data.filter(
    o => o.symbol === 'XBTUSD',
  )[0]

  positionTmp.next({ price, qua })
})

export const orders$ = concat(timer(0), orderEvents).pipe(
  switchMap(() => from(ordersPromise())),
  tap(debugOrders),
)

export const orderEvents$ = orderEvents.pipe(
  tap(debugOrderEvents),
  share(),
)

export const price$ = priceTmp.pipe(
  distinctUntilChanged((n, o) => n.bid === o.bid && n.ask === o.ask),
  tap(debugPrice),
  share(),
)

export const position$ = positionTmp.pipe(
  distinctUntilChanged(
    (n, o) => Math.round(n.price * 100) === Math.round(o.price * 100) && n.qua === o.qua,
  ),
  tap(debugPosition),
  share(),
)

function ordersPromise() {
  const verb = 'GET',
    path = '/api/v1/order?' + qs.stringify({ filter: JSON.stringify({ open: 'true' }) }),
    expires = Math.round(new Date().getTime() / 1000) + 60

  const signature = crypto
    .createHmac('sha256', BITMEX_API_SECRET)
    .update(verb + path + expires)
    .digest('hex')

  const requestOptions = {
    headers: {
      'api-expires': expires,
      'api-signature': signature,
    },
    responseType: 'json',
  }

  return gotClient
    .get(path, requestOptions)
    .then(r => JSON.parse(r.body))
    .catch(error => {
      const errJSON = JSON.parse(error.response.body)
      throw Error(errJSON.error.message)
    })
}
