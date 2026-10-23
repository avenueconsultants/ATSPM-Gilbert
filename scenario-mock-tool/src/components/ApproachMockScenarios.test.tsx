import { configRequest } from "@/lib/axios";
import "@testing-library/jest-dom";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useLocationStore } from "@/features/locations/components/editLocation/locationStore";
import { useLocationWizardStore } from "@/features/locations/components/LocationSetupWizard/locationSetupWizardStore";
import ApproachMockScenarios from "./ApproachMockScenarios";
import scenarios from "./approachMockScenarios.json";

jest.mock("@/stores/notifications", () => ({
  useNotificationStore: () => ({ addNotification: jest.fn() }),
}));
jest.mock("@/lib/axios", () => ({ configRequest: jest.fn() }));
beforeAll(() => {
  global.structuredClone = (value) => JSON.parse(JSON.stringify(value));
});
beforeEach(() => jest.clearAllMocks());
function choose(name: string) {
  fireEvent.mouseDown(
    screen.getByRole("combobox", { name: "Approach scenario" }),
  );
  fireEvent.click(screen.getByRole("option", { name }));
  fireEvent.click(
    screen.getByRole("button", { name: "Compare mock approaches" }),
  );
}

it.each(scenarios.map((s) => [s.name, s] as const))(
  "renders backend-verified scenario: %s",
  (name, scenario) => {
    render(<ApproachMockScenarios />);
    choose(name);
    expect(screen.getByText("Approaches Reconciliation Report")).toBeVisible();
    for (const warning of scenario.expected.reconciliationWarnings)
      expect(screen.getByText(warning)).toBeVisible();
    expect(
      screen
        .queryAllByRole("alert")
        .filter((a) => a.textContent?.includes("Review the left-turn")),
    ).toHaveLength(
      scenario.expected.reconciliationWarnings.some((w) => w.includes("FYA"))
        ? 1
        : 0,
    );
    expect(configRequest).not.toHaveBeenCalled();
  },
);

it("adds a phase and overlap of the same number independently and resets", async () => {
  const real = useLocationStore.getState();
  render(<ApproachMockScenarios />);
  choose("Same number, separate phase and overlap");
  fireEvent.click(screen.getAllByRole("button", { name: "3" })[1]);
  fireEvent.click(screen.getAllByRole("button", { name: /Add Selected/ })[1]);
  fireEvent.click(screen.getByRole("button", { name: "Add approaches" }));
  await screen.findByRole("table", { name: "Mock approach configuration" });
  const table = screen.getByRole("table", {
    name: "Mock approach configuration",
  });
  expect(within(table).getByText("3 (overlap)")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "3" }));
  fireEvent.click(screen.getAllByRole("button", { name: /Add Selected/ })[0]);
  fireEvent.click(screen.getByRole("button", { name: "Add approaches" }));
  await screen.findByRole("table", { name: "Mock approach configuration" });
  expect(within(table).getAllByText("New Approach")).toHaveLength(2);
  expect(within(table).getAllByRole("row")).toHaveLength(4);
  fireEvent.click(screen.getByRole("button", { name: "Reset scenario" }));
  expect(within(table).getAllByRole("row")).toHaveLength(2);
  expect(useLocationStore.getState()).toBe(real);
  expect(configRequest).not.toHaveBeenCalled();
});

it("adds a detector only to the chosen mock approach", async () => {
  render(<ApproachMockScenarios />);
  choose("Unconfigured detector channel");
  fireEvent.click(screen.getByRole("button", { name: "119" }));
  fireEvent.click(screen.getByRole("button", { name: /Add selected to/ }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Mock approach 1" }));
  fireEvent.click(screen.getByRole("button", { name: "Add detectors" }));
  expect(
    await screen.findByRole("table", { name: "Mock approach configuration" }),
  ).toHaveTextContent("118, 119");
  expect(configRequest).not.toHaveBeenCalled();
});

it.each([
  "Configured approach not observed",
  "Configured detector not observed",
])("delete is isolated: %s", async (name) => {
  const real = useLocationStore.getState();
  render(<ApproachMockScenarios />);
  choose(name);
  if (name.includes("approach")) {
    fireEvent.click(screen.getByRole("button", { name: "Delete entire approach: Mock approach 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete entire approach", exact: true }));
  } else {
    fireEvent.click(screen.getByRole("button", { name: "Select All" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove selected" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm removal" }));
  }
  const table = await screen.findByRole("table", { name: "Mock approach configuration" });
  if (name.includes("approach")) expect(table).not.toHaveTextContent("Mock approach 1");
  else expect(table).not.toHaveTextContent("118");
  expect(useLocationStore.getState()).toBe(real);
  expect(configRequest).not.toHaveBeenCalled();
});

it("ignore leaves configuration and real wizard state unchanged", () => {
  const real = useLocationWizardStore.getState();
  render(<ApproachMockScenarios />);
  choose("Remove missing protected; keep permissive");
  fireEvent.click(screen.getByRole("button", { name: "Select All" }));
  fireEvent.click(screen.getByRole("button", { name: /Ignore/ }));
  expect(screen.getByRole("table", { name: "Mock approach configuration" })).toHaveTextContent("Northbound test approach");
  expect(useLocationWizardStore.getState()).toBe(real);
  expect(configRequest).not.toHaveBeenCalled();
});
