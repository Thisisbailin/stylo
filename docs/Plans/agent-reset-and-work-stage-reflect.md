# Reflect — Agent reset boundary and work-stage messages

## What failed / nearly failed

The second strict typecheck rejected `defaultOpen` on native `<details>` because the repository's React DOM types expose only the standard `open` attribute. The grouping policy and tests were correct; the incompatibility was limited to the uncontrolled disclosure attribute choice.

## Three concrete improvements next time

1. Check the repository's installed React DOM attribute types before choosing uncontrolled native disclosure props.
2. Keep automatic run-stage collapse in a dedicated stateful component and leave nested tool disclosures on the simplest supported native contract.
3. Run a focused `tsc` immediately after changing shared intrinsic-element attributes, before the full test/build matrix.

## Lessons appended to context memory

- Stylo's current React type surface does not accept `defaultOpen` for `<details>`.
- A project reset is initialization, not a mutation: creating the mandatory Foundation skeleton must preserve revision `0`.
- Tool transport success and user-visible outcome are separate; budget skips and no-op updates require distinct UI labels.
