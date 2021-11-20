import { JWKInterface } from "arweave/node/lib/wallet";
import { SmartWeave, SmartWeaveNodeFactory } from "redstone-smartweave";
import { ExtensionOrJWK } from "./faces";
import Arweave from "arweave";
import Utils from "./utils";
import User from "./user";
import Token from "./token";
import Exchange from "./exchange";

const client = new Arweave({
  host: "arweave.net",
  port: 443,
  protocol: "https",
});

export default class Verto {
  public arweave = client;
  public wallet: ExtensionOrJWK = "use_wallet";
  public smartweave: SmartWeave;
  public cache: boolean;

  // Submodules
  private utils: Utils;
  /** Verto User related functions */
  public user: User;
  /** Arweave Token (NFT, PST, etc.) related functions */
  public token: Token;
  /** Verto Exchange related functions */
  public exchange: Exchange;

  /**
   *
   * @param arweave An optional Arweave instance.
   * @param wallet An optional Arweave keyfile.
   * @param cache Use the Verto cache.
   */
  constructor(arweave?: Arweave, wallet?: JWKInterface, cache: boolean = true) {
    if (arweave) this.arweave = arweave;
    if (wallet) this.wallet = wallet;

    this.cache = cache;
    this.smartweave = SmartWeaveNodeFactory.memCached(this.arweave);

    // Submodules
    this.utils = new Utils(
      this.arweave,
      this.wallet,
      this.cache,
      this.smartweave
    );
    this.token = new Token(
      this.arweave,
      this.wallet,
      this.cache,
      this.smartweave,
      this.utils
    );
    this.user = new User(this.arweave, this.cache, this.utils, this.token);
    this.exchange = new Exchange(
      this.arweave,
      this.wallet,
      this.smartweave,
      this.utils,
      this.token
    );
  }
}
