import { ExtensionOrJWK, GlobalConfigInterface } from "./faces";
import { CacheInterfaceConstants } from "verto-cache-interface";
import Utils, { ThreeEmModule } from "./utils";
import Arweave from "arweave";
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
  public cache: boolean;

  // Submodules
  private utils: Utils;
  /** Verto User related functions */
  public user: User;
  /** Arweave Token (NFT, PST, etc.) related functions */
  public token: Token;
  /** Verto Exchange related functions */
  public exchange: Exchange;

  /** 3em Driver (browser or node) */
  public static three_em: ThreeEmModule;

  /**
   *
   * @param arweave An optional Arweave instance.
   * @param wallet An optional Arweave keyfile.
   * @param cache Use the Verto cache.
   * @param globalConfig An optional config for global
   * variables, such as the contracts used by the protocol
   */
  constructor(
    wallet?: ExtensionOrJWK,
    arweave?: Arweave,
    cache: boolean = true,
    globalConfig?: GlobalConfigInterface
  ) {
    if (arweave) this.arweave = arweave;
    if (wallet) this.wallet = wallet;

    // configure the cache interface
    if (globalConfig?.CACHE_CONFIG) {
      const { CACHE_API, CONTRACT_CDN } = globalConfig.CACHE_CONFIG;

      // cache api url
      if (CACHE_API) {
        CacheInterfaceConstants.CACHE_API = CACHE_API;
      }

      // contract cdn
      if (CONTRACT_CDN) {
        CacheInterfaceConstants.CONTRACT_CDN = CONTRACT_CDN;
      }
    }

    // community contract id config
    if (globalConfig?.COMMUNITY_CONTRACT) {
      CacheInterfaceConstants.COMMUNITY_CONTRACT =
        globalConfig.COMMUNITY_CONTRACT;
    }

    this.cache = cache;

    // Submodules
    this.utils = new Utils(
      this.arweave,
      this.wallet,
      Verto.three_em,
      this.cache,
      globalConfig
    );
    this.token = new Token(this.arweave, this.wallet, this.cache, this.utils);
    this.exchange = new Exchange(
      this.arweave,
      this.wallet,
      this.utils,
      this.token
    );
    this.user = new User(
      this.arweave,
      this.cache,
      this.utils,
      this.token,
      this.exchange
    );
  }
}
