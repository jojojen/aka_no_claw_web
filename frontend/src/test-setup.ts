import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(cleanup);

// jsdom doesn't implement scrollIntoView; stub it globally so component tests pass.
Element.prototype.scrollIntoView = vi.fn();
