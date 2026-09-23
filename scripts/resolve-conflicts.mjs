import fs from "node:fs";

function resolve(content) {
  const out = [];
  const stack = [];
  let cur = { head: [], tail: [], inHead: true };

  const push = () => {
    stack.push(cur);
    cur = { head: [], tail: [], inHead: true };
  };
  const pop = () => {
    const done = cur;
    cur = stack.pop();
    const sink = cur.inHead ? cur.head : cur.tail;
    sink.push(...done.head);
  };

  for (const line of content.split("\n")) {
    if (/^<{7}(\s|$)/.test(line)) {
      push();
    } else if (/^={7}$/.test(line) && stack.length > 0) {
      cur.inHead = false;
    } else if (/^\|{7}/.test(line) && stack.length > 0) {
      cur.inHead = false;
    } else if (/^>{7}(\s|$)/.test(line)) {
      pop();
    } else {
      (cur.inHead ? cur.head : cur.tail).push(line);
    }
  }
  if (stack.length > 0) throw new Error("unbalanced conflict markers");
  if (cur.tail.length > 0) throw new Error("content after last conflict");
  return [...out, ...cur.head].join("\n");
}

const files = process.argv.slice(2);
for (const f of files) {
  const before = fs.readFileSync(f, "utf8");
  const after = resolve(before);
  if (/^(<{7}|={7}|>{7})/m.test(after)) throw new Error(`markers left in ${f}`);
  fs.writeFileSync(f, after);
  console.log(`${f}: ${before.length - after.length} bytes removed`);
}
