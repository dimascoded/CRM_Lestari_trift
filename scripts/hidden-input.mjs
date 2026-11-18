import { stdin, stdout } from "node:process";

const pendingLineFeeds = new WeakSet();

export function askHidden(label, input = stdin, output = stdout) {
  output.write(label);
  const wasRaw = input.isRaw;
  input.setRawMode(true);
  input.resume();
  return new Promise((resolve, reject) => {
    let value = "";
    let settled = false;
    let skipNextLineFeed = pendingLineFeeds.delete(input);
    const cleanup = () => {
      input.off("data", onData);
      input.off("end", onEnd);
      input.off("error", onError);
      input.setRawMode(Boolean(wasRaw));
      input.pause();
    };
    const fail = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      output.write("\n");
      reject(error);
    };
    const onData = (chunk) => {
      const characters = Array.from(chunk.toString());
      for (let index = 0; index < characters.length; index += 1) {
        let character = characters[index];
        if (skipNextLineFeed) {
          skipNextLineFeed = false;
          if (character === "\n") continue;
        }
        if (character === "\u0003") {
          fail(new Error("User provisioning cancelled."));
          return;
        }
        if (character === "\u0004") {
          fail(new Error("Password input cancelled."));
          return;
        }
        if (character === "\r" || character === "\n") {
          if (character === "\r" && characters[index + 1] === "\n") {
            index += 1;
          } else if (character === "\r") {
            pendingLineFeeds.add(input);
          }
          settled = true;
          cleanup();
          output.write("\n");
          resolve(value);
          return;
        }
        if (character === "\u007f" || character === "\b") {
          value = Array.from(value).slice(0, -1).join("");
        } else if (character >= " ") {
          value += character;
        }
      }
    };
    const onEnd = () => fail(new Error("Password input ended."));
    const onError = (error) => fail(error);
    input.on("data", onData);
    input.once("end", onEnd);
    input.once("error", onError);
  });
}
