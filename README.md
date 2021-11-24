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
- [Usage](#usage)
  - [Exchange](#exchange)
    - [Adding a new pair](#adding-a-new-pair)
    - [Swapping between two tokens](#swapping-between-two-tokens)
    - [Cancelling an order](#cancelling-an-order)
    - [Get the orderbook](#get-the-orderbook)
  - [Token](#token)
    - [Get tokens](#get-tokens)
    - [Get a token's type](#get-a-tokens-type)
    - [Get a token's price](#get-a-tokens-price)
    - [Get a token's price history](#get-a-tokens-price-history)
    - [Get a token's volume](#get-a-tokens-volume)
    - [Get a token's volume history](#get-a-tokens-volume-history)
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
```

The function takes one param:

- `input`: Token contract ID or token pair tuple

The function returns an array of orders.

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

#### Get a token's price

Fetches the price of a given token.

```ts
const price = await client.token.getPrice(
  "usjm4PCxUd5mtaon7zc97-dt-3qf67yPyqgzLnLqk5A"
);
```

The function takes one param:

- `id`: Token contract id

The function returns the price of the token.

#### Get a token's price history

Fetches the price history of a given token.

```ts
const history = await client.token.getPriceHistory(
  "usjm4PCxUd5mtaon7zc97-dt-3qf67yPyqgzLnLqk5A"
);
```

The function takes one param:

- `id`: Token contract id

The function returns the price history of the token.

#### Get a token's volume

Fetches the volume of a given token.

```ts
const volume = await client.token.getVolume(
  "usjm4PCxUd5mtaon7zc97-dt-3qf67yPyqgzLnLqk5A"
);
```

The function takes one param:

- `id`: Token contract id

The function returns the volume of the token.

#### Get a token's volume history

Fetches the volume history of a given token.

```ts
const history = await client.token.getVolumeHistory(
  "usjm4PCxUd5mtaon7zc97-dt-3qf67yPyqgzLnLqk5A"
);
```

The function takes one param:

- `id`: Token contract id

The function returns the volume history of the token.

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
  "usjm4PCxUd5mtaon7zc97-dt-3qf67yPyqgzLnLqk5A"
);
```

The function takes one param:

- `input`: User wallet address

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
