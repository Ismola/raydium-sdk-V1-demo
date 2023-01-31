import {
  AmmV3,
  buildTransaction,
  Percent,
  Token,
  TokenAmount,
  TradeV2,
} from '@raydium-io/raydium-sdk';
import { PublicKey } from '@solana/web3.js';

import {
  connection,
  wallet,
  wantBuildTxVersion,
} from '../config';
import {
  getWalletTokenAccount,
  sendTx,
} from './util';

async function routeSwap() {
  // get all pool info from api
  const ammV3Pool = (await (await fetch('https://api.raydium.io/v2/ammV3/ammPools')).json()).data // If the clmm pool is not required for routing, then this variable can be configured as undefined
  const ammV3PoolInfos = Object.values(await AmmV3.fetchMultiplePoolInfos({ connection, poolKeys: ammV3Pool, chainTime: new Date().getTime() / 1000 })).map(i => i.state)

  const ammV2Pool = await (await fetch('https://api.raydium.io/v2/sdk/liquidity/mainnet.json')).json() // If the Liquidity pool is not required for routing, then this variable can be configured as undefined

  // coin info
  const RAYToken = new Token(new PublicKey('4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R'), 6, 'RAY', 'RAY')
  const USDCToken = new Token(new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'), 6, 'USDC', 'USDC')

  // get all route info
  const getRoute = TradeV2.getAllRoute({ inputMint: RAYToken.mint, outputMint: USDCToken.mint, apiPoolList: ammV2Pool, ammV3List: ammV3PoolInfos })

  // get the information you need for the calculation 
  const [tickCache, poolInfosCache] = await Promise.all([
    await AmmV3.fetchMultiplePoolTickArrays({ connection, poolKeys: getRoute.needTickArray, batchRequest: true }),
    await TradeV2.fetchMultipleInfo({ connection, pools: getRoute.needSimulate, batchRequest: true })]
  )

  // Configure input/output parameters
  const inputTokenAmount = new TokenAmount(RAYToken, 100)
  const outputToken = USDCToken
  const slippage = new Percent(1, 100)

  // calculation result of all route
  const routeList = TradeV2.getAllRouteComputeAmountOut({
    directPath: getRoute.directPath,
    routePathDict: getRoute.routePathDict,
    simulateCache: poolInfosCache,
    tickCache,

    inputTokenAmount,
    outputToken,
    slippage,
    chainTime: new Date().getTime() / 1000 // this chain time
  })

  // get user all account
  const walletTokenAccountFormet = await getWalletTokenAccount(connection, wallet.publicKey)

  // make swap transaction
  const innerTx = await TradeV2.makeSwapInstructionSimple({
    connection,
    swapInfo: routeList[0],
    ownerInfo: {
      wallet: wallet.publicKey,
      tokenAccounts: walletTokenAccountFormet,
      associatedOnly: true
    },
    checkTransaction: true
  })


  const transactions = await buildTransaction({
    connection,
    txType: wantBuildTxVersion,
    payer: wallet.publicKey,
    innerTransactions: innerTx.innerTransactions,
  })

  const txids = await sendTx(connection, wallet, wantBuildTxVersion, transactions)
  console.log(txids)
}

routeSwap()