import moment, { Moment } from "moment";
import axios from "axios";

export const latestPrice = async (
  id: string,
  high?: Moment
): Promise<number> => {
  if (!high) {
    high = moment().add(1, "days").hours(0).minutes(0).seconds(0);
  }
  const low = high.clone().subtract(1, "days");

  const { data: orders } = await axios.get(
    `https://v2.cache.verto.exchange/orders?token=${id}&from=${low.unix()}&to=${high.unix()}`
  );

  if (orders.length === 0) {
    return await latestPrice(id, low);
  } else {
    const parsed = [];
    for (const order of orders) {
      if (order.status === "success") {
        const input = order.input.split(" ")[0];
        const inputUnit = order.input.split(" ")[1];
        const output = order.output.split(" ")[0];

        if (inputUnit === "AR") {
          parsed.push(input / output);
        }
      }
    }

    if (parsed.length) {
      return parsed.reduce((a, b) => a + b, 0) / parsed.length;
    } else {
      return await latestPrice(id, low);
    }
  }
};

export const price = async (
  id: string
): Promise<{ [date: string]: number }> => {
  const { data: orders } = await axios.get(
    `https://v2.cache.verto.exchange/orders?token=${id}`
  );

  const res: { [date: string]: number } = {};

  if (orders.length > 0) {
    let high = moment().add(1, "days").hours(0).minutes(0).seconds(0);

    while (high.unix() >= orders[orders.length - 1].timestamp) {
      const low = high.clone().subtract(1, "days");

      const day = orders.filter(
        (order: any) =>
          order.timestamp <= high.unix() && order.timestamp >= low.unix()
      );

      const parsed = [];
      for (const order of day) {
        if (order.status === "success") {
          const input = order.input.split(" ")[0];
          const inputUnit = order.input.split(" ")[1];
          const output = order.output.split(" ")[0];

          if (inputUnit === "AR") {
            parsed.push(input / output);
          }
        }
      }

      res[low.format("MMM DD, YYYY")] =
        parsed.reduce((a, b) => a + b, 0) / parsed.length;

      high = low;
    }
  }

  return fill(res);
};

const fill = (input: {
  [date: string]: number;
}): { [date: string]: number } => {
  let value = NaN;

  for (const key of Object.keys(input).reverse()) {
    if (isNaN(input[key])) {
      input[key] = value;
    } else {
      value = input[key];
    }
  }

  for (const key of Object.keys(input)) {
    if (isNaN(input[key])) {
      input[key] = value;
    } else {
      value = input[key];
    }
  }

  return input;
};
