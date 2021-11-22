<p align="center">
  <a href="https://verto.exchange">
    <img src="https://raw.githubusercontent.com/useverto/design/master/logo/logo_light.svg" alt="Verto logo (light version)" width="110" />
  </a>

  <h3 align="center">Verto JS Library</h3>

  <p align="center">
    Integrate The Verto Exchange's protocol easily
  </p>
</p>

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

TODO

### Token

TODO

### User

TODO

## License

The code contained within this repository is licensed under the MIT license.
See [`./LICENSE`](./LICENSE) for more information.
