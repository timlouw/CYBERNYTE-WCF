Adopt global CSS into Shadow DOM in shadow-dom.ts — create a singleton GlobalStyleManager that fetches assets/global.css, creates a CSSStyleSheet via new CSSStyleSheet() + replaceSync(), then adopts it into each shadow root: shadowRoot.adoptedStyleSheets = [globalSheet, componentSheet].
pre-bundle global CSS at compile time. (Recommend: C for best performance)
With all the above sujestions decide what will be the best performance wise at runtime

Fix list content update bug in dom-binding.ts:85-90 — the current code stores updated item but doesn't re-render DOM content when an item with the same key has different data. Add content diffing for primitives or a callback to update existing nodes.

Further Considerations


List update callback? For "update every 10th row", the benchmark changes item.label without changing item.id. Current approach won't detect this. Options: (A) require signals inside list items, (B) add onUpdate callback to repeat(), (C) deep-compare item properties. (Recommend: A — signals are already your reactive primitive)