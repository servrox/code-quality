const core = require("./core.cjs");
const createRuntimeConfig = require("./create-runtime-config.cjs");

const config = createRuntimeConfig();

module.exports = {
  options: core.options,
  forbidden: config.forbidden,
};
