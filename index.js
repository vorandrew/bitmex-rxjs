import 'dotenv/config'
import Debug from 'debug'

import { Subject } from 'rxjs'
import { distinctUntilChanged, share, tap } from 'rxjs/operators'

import BitMEXClient from 'bitmex-realtime-api'

const INACTIVE_ORDERS = [
  'Canceled',
  'Done for day',
  'Expired',
  'Filled',
  'Pending Cancel',
  'Rejected',
  'Replaced',
  'Stopped',
  'Suspended',
]

const client = new BitMEXClient({
  apiKeyID: process.env.BITMEX_API_KEY || null,
  apiKeySecret: process.env.BITMEX_API_SECRET || null,
})

const debugOrders = Debug('bitmex-rxjs:orders')
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

// https://github.com/BitMEX/api-connectors/issues/294

export const orders$ = orderEvents.pipe(tap(debugOrders))

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
