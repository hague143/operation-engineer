/* Exercise pure parsers without a browser or third-party runtime dependencies. */
const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const sandbox = {
  uuid: () => "fixture-model",
  assert: (ok, msg) => {
    if (!ok) throw Error(msg);
  },
};
vm.createContext(sandbox);
vm.runInContext(
  fs.readFileSync("standalone/src/geometry.js", "utf8") +
    "\nglobalThis.parse = parseGeometry; globalThis.synthetic = syntheticGeometry;",
  sandbox,
);
const parse = (text, name = "test.xyz", unit = "mm") =>
  sandbox.parse(text, name, unit);
assert.equal(parse("x,y,z\n0,0,0\n3,4,0", "points.csv").vertices.length, 2);
const obj = parse(
  "v 0 0 0\nv 3 0 0\nv 3 4 0\nv 0 4 0\nf -4 -3 -2 -1",
  "quad.obj",
);
assert.equal(obj.faces.length, 2);
const ply =
  "ply\nformat ascii 1.0\nelement vertex 3\nproperty uchar red\nproperty float z\nproperty float x\nproperty float y\nelement face 1\nproperty list uchar int vertex_indices\nend_header\n255 0 0 0\n255 0 3 0\n255 0 3 4\n3 0 1 2";
assert.deepEqual(Array.from(parse(ply, "points.ply").vertices[2]), [3, 4, 0]);
assert.equal(parse(ply, "points.ply").faces.length, 1);
const pipe = sandbox.synthetic();
assert.equal(
  Math.hypot(...pipe.vertices[0].map((n, k) => n - pipe.vertices[160][k])),
  2,
);
for (const [text, name] of [
  ["0 0 0\nInfinity 1 2", "nonfinite.xyz"],
  ["0 0 0\nNaN 1 2", "nan.xyz"],
  ["x,y,z\n0,,0\n1,2,3", "missing.csv"],
  ["0 0 0", "one.xyz"],
  ["v 0 0 0\nv 1 1 1\nf 1 2 99", "invalid.obj"],
  ["v 0 0 0 2\nv 1 1 1 2", "weighted.obj"],
  ["ply\nformat binary_little_endian 1.0\nend_header", "binary.ply"],
  ["0 0 0\n1 2 3", "native.rcp"],
  ["0 0 0\n1 2 3", "native.laz"],
  ["0 0 0\n1e100 1 1", "oversized.xyz"],
  [Array(20002).fill("0 0 0").join("\n"), "too-many.xyz"],
])
  assert.throws(() => parse(text, name), undefined, name);
console.log(
  "PASS: XYZ/CSV, reordered ASCII PLY properties, OBJ negative indices / triangulation, known synthetic distance, and invalid/unsupported/oversized geometry rejection.",
);
