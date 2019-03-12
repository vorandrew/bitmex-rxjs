import 'dotenv/config'

import { Subject } from 'rxjs'

import { distinctUntilChanged, share } from 'rxjs/operators'

import BitMEXClient from 'bitmex-realtime-api'

const client = new BitMEXClient({
  apiKeyID: process.env.BITMEX_API_KEY || null,
  apiKeySecret: process.env.BITMEX_API_SECRET || null,
})

const priceTmp = new Subject()
const positionTmp = new Subject()
const orders$ = new Subject()

client.addStream('XBTUSD', 'order', data => orders$.next(data))

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

const price$ = priceTmp.pipe(
  distinctUntilChanged((n, o) => n.bid === o.bid && n.ask === o.ask),
  share(),
)

const position$ = positionTmp.pipe(
  distinctUntilChanged((n, o) => n.price === o.price && n.qua === o.qua),
  share(),
)

export default {
  price$,
  position$,
  orders$,
}
