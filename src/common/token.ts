import {
  cacheContractHook,
  CommunityContractState,
  CommunityContractToken,
  fetchTokenMetadata,
  fetchTokens,
  fetchTokenStateMetadata,
  TokenMetadata,
} from "verto-cache-interface";
import { DecodedTag, ExtensionOrJWK, TokenInterface, TokenType } from "./faces";
import { interactWrite } from "smartweave";
import Arweave from "arweave";
import Utils from "./utils";

export default class Token {
  private arweave: Arweave;
  private wallet: ExtensionOrJWK;
  private cache: boolean;
  private utils: Utils;

  /**
   *
   * @param arweave Arweave instance
   * @param wallet Arweave keyfile
   * @param cache Use the Verto cache
   * @param utils Utils submodule
   */
  constructor(
    arweave: Arweave,
    wallet: ExtensionOrJWK,
    cache: boolean,
    utils: Utils
  ) {
    this.arweave = arweave;
    this.wallet = wallet;
    this.cache = cache;
    this.utils = utils;
  }

  /**
   * Fetches the tokens listed on Verto
   * @type Optional type filter
   * @returns List of token ids, names, & tickers
   */
  async getTokens(type?: TokenType): Promise<TokenInterface[]> {
    let tokens: CommunityContractToken[] = [];
    const parsedTokens: TokenInterface[] = [];

    if (this.cache) tokens = await fetchTokens(type);
    else {
      const contract = await this.utils.getState<CommunityContractState>(
        this.utils.COMMUNITY_CONTRACT
      );

      if (type) {
        tokens = contract.tokens.filter(
          (listedToken: Omit<TokenMetadata, "contractId">) =>
            listedToken.type === type
        );
      } else {
        tokens = contract.tokens;
      }
    }

    for (const token of tokens) {
      if (this.cache) {
        const data = await fetchTokenStateMetadata(token.id);

        if (!data) continue;
        parsedTokens.push({
          id: data.id,
          name: data.name,
          ticker: data.ticker,
        });
      } else {
        const data = await this.utils.getState(token.id);

        if (!data) continue;
        parsedTokens.push({
          id: token.id,
          name: data.name,
          ticker: data.ticker,
        });
      }
    }

    return parsedTokens;
  }

  /**
   * Fetches the type for a given token
   * @param id Token contract id
   * @returns The type of the token
   */
  async getTokenType(id: string): Promise<TokenType | undefined> {
    if (this.cache) {
      const tokenMetadata = await fetchTokenMetadata(id);

      return tokenMetadata?.type as TokenType;
    } else {
      const communityContractState = await this.utils.getState<CommunityContractState>(
        this.utils.COMMUNITY_CONTRACT
      );
      const token = communityContractState.tokens.find(
        (listedToken) => listedToken.id === id
      );

      return token?.type as TokenType;
    }
  }

  /**
   * Gets the URL of the logo of an Arweave token. Uses the Cryptometa API by Ashlar
   * @param id ID of the token
   * @param theme Logo theme to return ("dark" | "light")
   * @returns Token logo URL
   */
  getLogo(id: string, theme: "light" | "dark" = "light"): string {
    return `https://meta.viewblock.io/AR.${id}/logo?t=${theme}`;
  }

  /**
   * Transfer a specified amount of tokens to another wallet
   * @param amount The amount of tokens
   * @param id Token contract id
   * @param target The receiving address
   * @param tags Optional additional tags
   * @returns The transaction id of the transfer
   */
  async transfer(
    amount: number,
    id: string,
    target: string,
    tags: { name: string; value: string }[] = []
  ) {
    const interaction = async () => {
      // create interaction
      const interactionID = interactWrite(
        this.arweave,
        this.wallet,
        id,
        {
          function: "transfer",
          target,
          qty: amount,
        },
        [
          { name: "Exchange", value: "Verto" },
          { name: "Action", value: "Transfer" },
          ...tags,
        ],
        target,
        "0"
      );

      // mine if testnet
      await this.utils.mineIfNeeded();

      return interactionID;
    };

    // get listed tokens to see if we need to refresh the cache
    const listedTokens = await fetchTokens();
    let transaction: string | null;

    if (listedTokens.find((token) => token.id === id))
      transaction = await cacheContractHook(interaction, id);
    else transaction = await interaction();

    if (!transaction) throw new Error("Could not create transfer interaction.");

    return transaction;
  }

  /**
   * List a new token on the exchange.
   * @param address The ID of the token
   * @param type The type of the token
   * @param tags Optional additional tags
   * @returns InteractionID
   */
  async list(
    address: string,
    type: TokenType,
    tags: DecodedTag[] = []
  ): Promise<string> {
    if (!this.utils.validateHash(address))
      throw new Error("Invalid token address.");

    const interactionID = await cacheContractHook(
      async () => {
        // create interaction
        const id = interactWrite(
          this.arweave,
          this.wallet,
          this.utils.COMMUNITY_CONTRACT,
          {
            function: "list",
            id: address,
            type,
          },
          [
            {
              name: "Exchange",
              value: "Verto",
            },
            {
              name: "Action",
              value: "ListToken",
            },
            ...tags,
          ]
        );

        // mine if testnet
        await this.utils.mineIfNeeded();

        return id;
      },
      this.utils.COMMUNITY_CONTRACT,
      true
    );

    if (!interactionID) throw new Error("Could not list token.");

    return interactionID;
  }
}
