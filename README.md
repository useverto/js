<p align="center" id="title">
  <a href="https://verto.exchange">
    <img src="https://raw.githubusercontent.com/useverto/design/master/logo/logo_light.svg" alt="Verto logo (light version)" width="110" />
  </a>

  <h3 align="center">Verto JS Library</h3>

  <p align="center">
    Integrate The Verto Exchange's protocol easily
  </p>
</p>

- [Installation](#installation)
- [Initialization](#initialization)
- [Testnet usage](#testnet-usage)
- [Usage](#usage)
  - [Exchange](#exchange)
    - [Adding a new pair](#adding-a-new-pair)
    - [Swapping between two tokens](#swapping-between-two-tokens)
    - [Cancelling an order](#cancelling-an-order)
    - [Get the orderbook](#get-the-orderbook)
    - [Get an order](#get-an-order)
    - [Get an estimate for a swap](#get-an-estimate-for-a-swap)
  - [Token](#token)
    - [Get tokens](#get-tokens)
    - [Get a token's type](#get-a-tokens-type)
    - [Get a flexible logo for the token](#get-a-flexible-logo-for-the-token)
    - [Transfer tokens](#transfer-tokens)
    - [List a token](#list-a-token)
  - [User](#user)
    - [Get user data](#get-user-data)
    - [Get balance](#get-balance)
    - [Get orders](#get-orders)
    - [Get transactions](#get-transactions)
- [License](#license)

## Installation

```sh
npm install @verto/js
```

or

```sh
yarn add @verto/js
```

## Initialization

To use the library, you'll need to initialize it:

```ts
import Verto from "@verto/js";

const client = new Verto();
```

You can initialise with a few optional parameters to customize the behaviour of the library:

```ts
const client = new Verto(
  { ... }, // wallet to use for interactions (for arconnect, leave it undefined or "use_wallet")
  new Arweave(...), // custom arweave client
  false, // optionally disable loading contract data from the cache. Note: this will slow down fetching
  {
    CLOB_CONTRACT: "...", // optional custom clob contract
    COMMUNITY_CONTRACT: "..." // optional custom community contract
  }
);
```

## Testnet usage

For the Verto testnet, you can use the following configuration:

```ts
const client = new Verto(
  "use_wallet", // can be configured
  new Arweave({
    host: "www.arweave.run",
    port: "443",
    protocol: "https",
  }),
  true, // can be configured
  {
    COMMUNITY_CONTRACT: "ppk1GzzOU2hwjEUMqVkqyAvsj-BPakNzuEKEzhJtyJE",
    CLOB_CONTRACT: "ySwuiyQGm-jDDa2OD1ub6QLWTCklOxkPesnaJnmoFUc",
    CACHE_CONFIG: {
      CONTRACT_CDN:
        "https://storage.googleapis.com/verto-exchange-contracts-stage",
      CACHE_API: "https://verto-qa.wn.r.appspot.com",
    },
    EXCHANGE_CONTRACT: "krW6M5Y1zqcWorlWjSURE-C7s0UsLO5whuOBLDecNlg",
  }
);
```

## Usage

The library supports data requests and interactions with the protocol:

### Exchange

The exchange submodule is accessible like this:

```ts
// example usage to access the swap function in the exchange submodule
await client.exchange.swap(...);
```

#### Adding a new pair

This will add a new pair to the exchange protocol.

```ts
const interactionID = await client.exchange.addPair([
  "usjm4PCxUd5mtaon7zc97-dt-3qf67yPyqgzLnLqk5A", // token ids for the pair
  "-8A6RexFkpfWwuyVO98wzSFZh0d6VJuI-buTJvlwOJQ",
]);
```

The function takes two params:

- `pair`: A tuple of two token IDs to add as a pair
- `tags`: _Optional._ Custom tags to add to the interaction

The function returns the created interaction's ID.

#### Swapping between two tokens

This will create a new swap between two Arweave tokens.

```ts
const interactionID = await client.exchange.swap(
  [
    "usjm4PCxUd5mtaon7zc97-dt-3qf67yPyqgzLnLqk5A",
    "-8A6RexFkpfWwuyVO98wzSFZh0d6VJuI-buTJvlwOJQ",
  ],
  1000
);
```

The function takes four params:

- `pair`: The two tokens to trade between. Must be an existing pair
- `amount`: The amount of tokens sent to the contract
- `price`: _Optional._ Price for the order
- `tags`: _Optional._ Custom tags to add to the interaction

The function returns the created interaction's ID.

#### Cancelling an order

This will return the non-filled tokens for an order and remove it from the orderbook.

```ts
const interactionID = await client.exchange.cancel(
  "xUd5mtaonpfWwuyVO98wzSFZh0d6VJuIxbuTJvlwOJQ"
);
```

The function takes one param:

- `orderID`: The transaction id of the swap

The function returns the created interaction's ID.

#### Get the orderbook

This fetches the order book for a specific token from the CLOB contract.

```ts
// for a specific token
const tokenOrders = await client.exchange.getOrderBook(
  "usjm4PCxUd5mtaon7zc97-dt-3qf67yPyqgzLnLqk5A"
);

// for a token pair
const pairOrders = await client.exchange.getOrderBook([
  "usjm4PCxUd5mtaon7zc97-dt-3qf67yPyqgzLnLqk5A",
  "-8A6RexFkpfWwuyVO98wzSFZh0d6VJuI-buTJvlwOJQ",
]);

// for all orders in the contract
const allOrders = await client.exchange.getOrderBook();
```

The function takes one param:

- `input`: Token contract ID or token pair tuple

The function returns an array of orders.

#### Get an order

Fetches a single order from the orderbook by it's ID.

```ts
const order = await client.exchange.getOrder(
  "xUd5mtaonpfWwuyVO98wzSFZh0d6VJuIxbuTJvlwOJQ"
);
```

The function takes one param:

- `orderID`: The transaction ID of the order interaction

The function returns an order along with the token pair it belongs to.

#### Get an estimate for a swap

Calculates an estimate of the amount of tokens that the user would receive by making a swap.

```ts
const estimate = await client.exchange.estimateSwap(
  [
    "usjm4PCxUd5mtaon7zc97-dt-3qf67yPyqgzLnLqk5A",
    "-8A6RexFkpfWwuyVO98wzSFZh0d6VJuI-buTJvlwOJQ",
  ],
  10,
  3
);
```

The function takes three params:

- `pair`: The two tokens to trade between. Must be an existing pair
- `amount`: The amount of tokens sent to the contract
- `price`: _Optional._ Price for the order

The function returns an object with all the costs for the swap, and how much the user would get refunded / received.

### Token

#### Get tokens

Fetches all tokens, such as NFTs, PSTs and communities listed on Verto.

```ts
const tokens = await client.token.getTokens();
```

The function takes one param:

- `type`: _Optional._ Type filter

The function returns an array of tokens.

#### Get a token's type

Fetches the type of a given token.

```ts
const type = await client.token.getTokenType(
  "usjm4PCxUd5mtaon7zc97-dt-3qf67yPyqgzLnLqk5A"
);
```

The function takes one param:

- `id`: Token contract id

The function returns the type of the token.

#### Get a flexible logo for the token

Returns a flexible logo's URL, that supports dark & light theme. If the token doesn't have a logo, it will return a placeholder for it.

The function uses the [CryptoMeta API](https://github.com/Ashlar/cryptometa) by Ashlar. Logos can be submitted [here](https://github.com/Ashlar/cryptometa/blob/master/PULL_REQUEST_TEMPLATE.md);

```ts
const logo = client.token.getLogo(
  "usjm4PCxUd5mtaon7zc97-dt-3qf67yPyqgzLnLqk5A",
  "dark"
);
```

The function takes two params:

- `id`: Token contract ID
- `theme`: _Optional._ UI theme to return the icon for (`"light" | "dark"`)

The function returns an URL for the appropriate logo.

#### Transfer tokens

Send tokens to a target address.

```ts
const interactionID = await client.token.transfer(
  1000,
  "usjm4PCxUd5mtaon7zc97-dt-3qf67yPyqgzLnLqk5A",
  "XcNXJS1UcJ05rTMWPo7l8liFFTBRgL3McfFGVliIybs"
);
```

The function takes four params:

- `amount`: The amount of tokens to send
- `id`: Token contract ID
- `target`: Target of the transfer
- `tags`: _Optional._ Custom tags for the interaction

The function returns the created interaction's ID.

#### List a token

List a new token on the exchange protocol.

```ts
const interactionID = await client.token.list(
  "usjm4PCxUd5mtaon7zc97-dt-3qf67yPyqgzLnLqk5A",
  "community"
);
```

The function takes three params:

- `id`: Token contract ID
- `type`: The type of the token
- `tags`: _Optional._ Custom tags for the interaction

The function returns the created interaction's ID.

### User

#### Get user data

Fetch user info for an input (address or username).

```ts
const userinfo = await client.user.getUser("martonlederer");
```

The function takes one param:

- `input`: User wallet address or username

The function returns the user's data (avatar, name, etc.).

#### Get balance

Fetch assets for a given address.

```ts
const balances = await client.user.getBalances(
  "usjm4PCxUd5mtaon7zc97-dt-3qf67yPyqgzLnLqk5A",
  "art"
);
```

The function takes one param:

- `input`: User name or user wallet address
- `type`: _Optional._ Token type filter

The function returns the balances for the user.

#### Get orders

Fetch orders for a given address.

```ts
const orders = await client.user.getOrders(
  "usjm4PCxUd5mtaon7zc97-dt-3qf67yPyqgzLnLqk5A"
);
```

The function takes one param:

- `input`: User wallet address

The function returns the orders for the user.

#### Get transactions

Fetch transactions for a given wallet address.

```ts
const transactions = await client.user.getTransactions(
  "usjm4PCxUd5mtaon7zc97-dt-3qf67yPyqgzLnLqk5A"
);
```

The function takes one params:

- `input`: User wallet address
- `after`: _Optional._ Transaction to fetch after

The function returns the transactions for the user.

## License

The code contained within this repository is licensed under the MIT license.
See [`./LICENSE`](./LICENSE) for more information.
