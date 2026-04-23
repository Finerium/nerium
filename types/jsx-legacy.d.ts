// React 19 removed the global `JSX` namespace that @types/react@18 provided.
// P0 (pre-RV) component code annotates returns as `JSX.Element`. Re-expose the
// namespace here as an alias of React.JSX so those files compile unmodified
// during the RV pivot. New RV code should reference `React.JSX.Element`
// directly instead of the global alias.
import type { JSX as ReactJSX } from 'react';

declare global {
  namespace JSX {
    type Element = ReactJSX.Element;
    type ElementClass = ReactJSX.ElementClass;
    type ElementAttributesProperty = ReactJSX.ElementAttributesProperty;
    type ElementChildrenAttribute = ReactJSX.ElementChildrenAttribute;
    type LibraryManagedAttributes<C, P> = ReactJSX.LibraryManagedAttributes<C, P>;
    type IntrinsicAttributes = ReactJSX.IntrinsicAttributes;
    type IntrinsicClassAttributes<T> = ReactJSX.IntrinsicClassAttributes<T>;
    type IntrinsicElements = ReactJSX.IntrinsicElements;
  }
}

export {};
