module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: ["./tsconfig.json"],
    tsconfigRootDir: __dirname
  },
  ignorePatterns: [".eslintrc.js", "index.js"], // ✅ Ignore these files
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended"
  ],
  rules: {
    "@typescript-eslint/no-var-requires": "off", // ✅ Allow 'require' in JS files
    "@typescript-eslint/no-unused-vars": "warn"  // ✅ Change unused vars to warnings
  }
};
