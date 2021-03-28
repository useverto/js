import Arweave from "arweave";
import ArDB from "ardb";
import moment, { Moment } from "moment";

export const latestPrice = async (
  id: string,
  client: Arweave,
  orders?: { rate: number; timestamp: number }[],
  high?: Moment
): Promise<number> => {
  if (!orders) {
    const gql = new ArDB(client);
    const res = await gql
      .search()
      .tag("Exchange", "Verto")
      .tag("Type", "Buy")
      .tag("Token", id)
      .findAll();

    orders = [];
    // @ts-ignore
    for (const edge of res) {
      const confirmation: any = await gql
        .search()
        .tag("Exchange", "Verto")
        .tag("Type", "Confirmation")
        .tag("Match", edge.node.id)
        .findOne();

      if (confirmation.length === 1) {
        const node = confirmation[0].node;
        const received = node.tags.find((tag: any) => tag.name === "Received");

        if (received) {
          const amnt = Math.floor(parseFloat(received.value.split(" ")[0]));

          if (amnt !== 0) {
            orders.push({
              rate: parseFloat(edge.node.quantity.ar) / amnt,
              timestamp: node.block
                ? node.block.timestamp
                : parseInt(new Date().getTime().toString().slice(0, -3)),
            });
          }
        }
      }
    }
  }

  if (!high) {
    high = moment().add(1, "days").hours(0).minutes(0).seconds(0);
  }
  const low = high.clone().subtract(1, "days");

  const filtered = orders
    .filter(
      (order) =>
        order.timestamp <= high!.unix() && order.timestamp >= low.unix()
    )
    .map((order) => order.rate);
  if (filtered.length === 0) {
    return await latestPrice(id, client, orders, low);
  } else {
    return filtered.reduce((a, b) => a + b, 0) / filtered.length;
  }
};
