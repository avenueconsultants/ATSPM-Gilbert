import { expect, test, type Page } from "@playwright/test";
import scenarios from "../src/components/approachMockScenarios.json";

test.use({ serviceWorkers: "block" });
async function openTool(page: Page) {
  const writes: string[] = [];
  await page.route("**/*", async (route) => {
    if (
      !["GET", "HEAD"].includes(route.request().method()) ||
      new URL(route.request().url()).pathname.startsWith("/api/") ||
      new URL(route.request().url()).origin !==
        new URL(test.info().project.use.baseURL as string).origin
    ) {
      writes.push(route.request().url());
      return route.abort();
    }
    return route.continue();
  });
  await page.goto("/");
  await page.getByRole("tab", { name: "Approaches", exact: true }).click();
  return writes;
}
async function choose(page: Page, name: string) {
  await page.getByRole("combobox", { name: "Approach scenario" }).click();
  await page.getByRole("option", { name, exact: true }).click();
  await page.getByRole("button", { name: "Compare mock approaches" }).click();
}

test("all backend-verified approach scenarios render in the tool", async ({
  page,
}) => {
  const writes = await openTool(page);
  for (const scenario of scenarios) {
    await test.step(scenario.name, async () => {
      await choose(page, scenario.name);
      await expect(
        page.getByText("Approaches Reconciliation Report", { exact: true }),
      ).toBeVisible();
      for (const warning of scenario.expected.reconciliationWarnings)
        await expect(page.getByText(warning, { exact: true })).toBeVisible();
      await expect(
        page
          .getByRole("table", { name: "Mock approach configuration" })
          .getByRole("row"),
      ).toHaveCount(scenario.location.approaches.length + 1);
    });
  }
  expect(writes).toEqual([]);
});

test("phase and overlap additions stay separate; reset restores the mock configuration", async ({
  page,
}) => {
  const writes = await openTool(page);
  await choose(page, "Same number, separate phase and overlap");
  await page.getByRole("button", { name: "3", exact: true }).nth(1).click();
  await page
    .getByRole("button", { name: /Add Selected/ })
    .nth(1)
    .click();
  await page
    .getByRole("button", { name: "Add approaches", exact: true })
    .click();
  await expect(
    page.getByRole("table", { name: "Mock approach configuration" }),
  ).toContainText("3 (overlap)");
  await page.getByRole("button", { name: "3", exact: true }).click();
  await page
    .getByRole("button", { name: /Add Selected/ })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Add approaches", exact: true })
    .click();
  await expect(
    page.getByRole("table", { name: "Mock approach configuration" }),
  ).toContainText("New Approach");
  await expect(page.getByRole("table").getByRole("row")).toHaveCount(4);
  await page.getByRole("button", { name: "Reset scenario" }).click();
  await expect(page.getByRole("table").getByRole("row")).toHaveCount(2);
  expect(writes).toEqual([]);
});

test("mock deletion never writes to the API", async ({ page }) => {
  const writes = await openTool(page);
  await choose(page, "Configured detector not observed");
  await page.getByRole("button", { name: "Select All", exact: true }).click();
  await page
    .getByRole("button", { name: "Remove selected", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm removal", exact: true })
    .click();
  await expect(page.getByRole("table")).not.toContainText("118");
  expect(writes).toEqual([]);
});

test("lane mocks work without ATSPM services", async ({ page }) => {
  const requests = await openTool(page);
  await page.getByRole("tab", { name: "Lanes", exact: true }).click();
  await page.getByRole("button", { name: "Compare mock lanes" }).click();
  await expect(
    page.getByText(
      "When applied, Channel 118 zone NB-18 will change from Through/Right to Through.",
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Add Channel 65 zone NB-18 Right" })
    .click();
  await page
    .getByRole("button", { name: "Apply selected to mock configuration" })
    .click();
  await expect(page.getByRole("table")).toContainText("Right");
  await expect(page.getByRole("table")).toContainText("Through");
  expect(requests).toEqual([]);
});

test("detector editor preserves properties, validates channels, and cancels drafts", async ({
  page,
}) => {
  page.setDefaultTimeout(15000);
  const requests = await openTool(page);
  await choose(page, "Unconfigured detector channel");
  const openEditor = async () => {
    await page.getByRole("button", { name: "119", exact: true }).click();
    await page.getByRole("button", { name: /Add selected to/ }).click();
    await page
      .getByRole("menuitem", { name: "Mock approach 1", exact: true })
      .click();
  };
  await openEditor();
  const dialog = page.getByRole("dialog");
  const editText = async (col: number, value: string) => {
    const cell = dialog.locator(`[data-row="1"][data-col="${col}"]`);
    await cell.click();
    await cell.press("Enter");
    await cell.getByRole("textbox").fill(value);
    await cell.getByRole("textbox").press("Enter");
  };
  await editText(0, "NB-18");
  await editText(5, "2");
  await dialog.locator('[data-row="1"][data-col="6"]').click();
  await page.getByRole("option", { name: "Thru", exact: true }).click();
  await dialog.locator('[data-row="1"][data-col="2"]').click();
  await page
    .getByRole("option")
    .filter({ hasText: "Lane-by-lane count" })
    .click();
  await page.keyboard.press("Escape");
  await editText(1, "118");
  await expect(
    dialog.getByRole("button", { name: "Add detectors" }),
  ).toBeDisabled();
  await editText(1, "119");
  await dialog.getByRole("button", { name: "Add detectors" }).click();
  const properties = JSON.parse(
    (await page.getByTestId("mock-detector-properties").textContent()) || "[]",
  );
  const added = properties.find((d: any) => d.detectorChannel === 119);
  expect(added).toMatchObject({
    dectectorIdentifier: "NB-18",
    laneNumber: "2",
    movementType: "T",
  });
  expect(added.detectionTypes[0].abbreviation).toBe("LLC");
  await page.getByRole("button", { name: "Reset scenario" }).click();
  await page.getByRole("button", { name: "Compare mock approaches" }).click();
  await openEditor();
  await editText(0, "discard me");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("table", { name: "Mock approach configuration" }),
  ).not.toContainText("119");
  expect(requests).toEqual([]);
});

test("approach drafts preserve fields and overlap identity and support cancel", async ({
  page,
}) => {
  page.setDefaultTimeout(15000);
  const requests = await openTool(page);
  await choose(page, "Same number, separate phase and overlap");
  await page.getByRole("button", { name: "3", exact: true }).nth(1).click();
  await page
    .getByRole("button", { name: /Add Selected/ })
    .nth(1)
    .click();
  const dialog = page.getByRole("dialog");
  const edit = async (col: number, value: string) => {
    const cell = dialog.locator(`[data-row="0"][data-col="${col}"]`);
    await cell.click();
    await cell.press("Enter");
    await cell.getByRole("textbox").fill(value);
    await cell.getByRole("textbox").press("Enter");
  };
  await edit(1, "Northbound left");
  await edit(4, "7");
  await edit(5, "81,82");
  await edit(6, "35");
  await edit(10, "9");
  await edit(2, "4");
  await expect(
    dialog.getByRole("button", { name: "Add approaches" }),
  ).toBeDisabled();
  await edit(2, "3");
  await dialog.getByRole("button", { name: "Add approaches" }).click();
  const approaches = JSON.parse(
    (await page.getByTestId("mock-approach-properties").textContent()) || "[]",
  );
  expect(
    approaches.find((a: any) => a.description === "Northbound left"),
  ).toMatchObject({
    protectedPhaseNumber: 3,
    isProtectedPhaseOverlap: true,
    pedestrianPhaseNumber: 7,
    pedestrianDetectors: "81,82",
    mph: "35",
    transitSignalPriorityNumber: "9",
  });
  await page.getByRole("button", { name: "3", exact: true }).click();
  await page
    .getByRole("button", { name: /Add Selected/ })
    .first()
    .click();
  await edit(1, "Discard this");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("table", { name: "Mock approach configuration" }),
  ).not.toContainText("Discard this");
  expect(requests).toEqual([]);
});

test("last overlap shows configuration and only offers whole approach deletion", async ({
  page,
}) => {
  const requests = await openTool(page);
  await choose(page, "Protected assignment \u2014 overlap absent, phase observed");
  const card = page.getByRole("region", { name: "Current configuration: Mock approach 1" });
  await expect(card).toHaveCount(1);
  await expect(card.getByRole("button", { name: "Remove protected overlap 3" })).toHaveCount(0);
  await expect(card.getByRole("table", { name: "edit approach table" })).toBeVisible();
  await expect(card.getByRole("button", { name: "Delete entire approach: Mock approach 1" })).toBeVisible();
  await expect(
    page.getByRole("table", { name: "Mock approach configuration" }),
  ).toContainText("Mock approach 1");
  expect(requests).toEqual([]);
});

for (const name of [
  "Remove missing protected; keep permissive",
  "Remove missing permissive overlap; keep protected",
  "Remove missing pedestrian overlap; keep vehicle phases",
]) {
  test(`assignment removal: ${name}`, async ({ page }) => {
    const requests = await openTool(page);
    await choose(page, name);
    const initial = JSON.parse(
      (await page.getByTestId("mock-approach-properties").textContent()) ||
        "[]",
    )[0];
    await page.getByRole("button", { name: "Select All", exact: true }).click();
    await page
      .getByRole("button", { name: "Remove selected", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Confirm removal", exact: true })
      .click();
    const after = JSON.parse(
      (await page.getByTestId("mock-approach-properties").textContent()) ||
        "[]",
    );
    expect(after).toHaveLength(1);
    expect(after[0].detectors).toEqual(initial.detectors);
    const fixture = scenarios.find((s) => s.name === name)!;
    const expected = { ...initial };
    for (const assignment of fixture.expected.missingPhaseAssignments) {
      expected[`${assignment.role}PhaseNumber`] =
        assignment.role === "protected" ? 0 : null;
      expected[
        `is${assignment.role[0].toUpperCase()}${assignment.role.slice(1)}PhaseOverlap`
      ] = false;
    }
    expect(after[0]).toEqual(expected);
    expect(requests).toEqual([]);
  });
}

test("whole-approach deletion is separate and cancel preserves all configuration", async ({
  page,
}) => {
  const requests = await openTool(page);
  await choose(page, "Delete entire unobserved approach explicitly");
  const before = await page
    .getByTestId("mock-approach-properties")
    .textContent();
  await page.getByRole("button", { name: "Select All", exact: true }).click();
  await page
    .getByRole("button", { name: "Remove protected phase 1", exact: true })
    .click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await page.getByTestId("mock-approach-properties").textContent()).toBe(
    before,
  );
  await page
    .getByRole("button", {
      name: "Delete entire approach: Northbound test approach",
      exact: true,
    })
    .click();
  await expect(page.getByRole("dialog")).toContainText("all of its detectors");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await page.getByTestId("mock-approach-properties").textContent()).toBe(
    before,
  );
  await page
    .getByRole("button", {
      name: "Delete entire approach: Northbound test approach",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Delete entire approach", exact: true })
    .click();
  expect(
    JSON.parse(
      (await page.getByTestId("mock-approach-properties").textContent()) ||
        "[]",
    ),
  ).toEqual([]);
  expect(requests).toEqual([]);
});
test("direct removal from the configuration card keeps the other missing assignment", async ({ page }) => {
  const requests = await openTool(page);
  await choose(page, "Remove multiple assignments; keep remaining phase");
  const card = page.getByRole("region", { name: "Current configuration: Northbound test approach" });
  await expect(card).toHaveCount(1);
  await expect(card.getByRole("table", { name: "edit approach table" })).toBeVisible();
  await expect(card).toContainText("118");
  await page.getByRole("button", { name: "Select All", exact: true }).click();
  await card.getByRole("button", { name: "Remove protected phase 1", exact: true }).click();
  await page.getByRole("button", { name: "Confirm removal", exact: true }).click();
  const after = JSON.parse((await page.getByTestId("mock-approach-properties").textContent()) || "[]");
  expect(after[0].protectedPhaseNumber).toBe(0);
  expect(after[0].permissivePhaseNumber).toBe(2);
  expect(after[0].pedestrianPhaseNumber).toBe(3);
  expect(after[0].detectors).toHaveLength(1);
  await expect(card.getByRole("button", { name: "Remove permissive overlap 2", exact: true })).toHaveCount(0);
  expect(requests).toEqual([]);
});

test("last vehicle assignment only offers whole approach deletion", async ({ page }) => {
  await openTool(page);
  await choose(page, "Remove last assignment; keep approach and detectors");
  const card = page.getByRole("region", { name: "Current configuration: Northbound test approach" });
  await expect(card.getByRole("button", { name: /Remove protected/ })).toHaveCount(0);
  await expect(card.getByRole("button", { name: /Delete entire approach/ })).toBeVisible();
});

test("bulk removal cannot clear all vehicle assignments", async ({ page }) => {
  await openTool(page);
  await choose(page, "Remove multiple assignments; keep remaining phase");
  await page.getByRole("button", { name: "Select All", exact: true }).click();
  await expect(page.getByRole("button", { name: "Remove selected", exact: true })).toBeDisabled();
  await expect(page.getByText("This selection would leave an approach without a vehicle phase or overlap.", { exact: false })).toBeVisible();
});

test("existing approach editor updates the current reconciliation configuration", async ({ page }) => {
  await openTool(page);
  await choose(page, "Remove missing protected; keep permissive");
  const card = page.getByRole("region", { name: "Current configuration: Northbound test approach" });
  const editor = card.getByRole("table", { name: "edit approach table" });
  const cell = editor.locator('[data-row="0"][data-col="6"]');
  await cell.click();
  await cell.press("Enter");
  await cell.getByRole("textbox").fill("35");
  await cell.getByRole("textbox").press("Enter");
  const state = JSON.parse((await page.getByTestId("mock-approach-properties").textContent()) || "[]");
  expect(Number(state[0].mph)).toBe(35);
  expect(state[0].detectors).toHaveLength(1);
  await expect(card.getByRole("button", { name: "Remove protected phase 1" })).toBeVisible();
});

test("adds an overlap to an existing approach without replacing its phase or detectors", async ({ page }) => {
  const requests = await openTool(page);
  await choose(page, "Same number, separate phase and overlap");
  const before = JSON.parse((await page.getByTestId("mock-approach-properties").textContent()) || "[]");
  await page.getByRole("button", { name: "3", exact: true }).nth(1).click();
  await page.getByRole("button", { name: /Add Selected/ }).nth(1).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Add overlap to").click();
  await page.getByRole("option", { name: before[0].description, exact: true }).click();
  await dialog.getByRole("button", { name: "Apply approach changes" }).click();
  const after = JSON.parse((await page.getByTestId("mock-approach-properties").textContent()) || "[]");
  expect(after).toHaveLength(before.length);
  expect(after[0].protectedPhaseNumber).toBe(before[0].protectedPhaseNumber);
  expect(after[0].permissivePhaseNumber).toBe(3);
  expect(after[0].isPermissivePhaseOverlap).toBe(true);
  expect(after[0].detectors).toEqual(before[0].detectors);
  expect(requests).toEqual([]);
});
test("separate configured turn zones with shared camera evidence remain a review decision", async ({ page }) => {
  const requests = await openTool(page);
  await page.getByRole("tab", { name: "Lanes", exact: true }).click();
  await page.getByRole("combobox", { name: /Scenario/ }).click();
  await page.getByRole("option", { name: "Separate Through/Right zones, shared camera zone" }).click();
  await expect(page.getByLabel("through", { exact: true })).toHaveValue("120");
  await expect(page.getByLabel("right", { exact: true })).toHaveValue("30");
  await page.getByRole("button", { name: "Compare mock lanes" }).click();
  await expect(page.getByText(/Channel 119, zone NB-19: not returned by the devices/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Change Channel 119 zone NB-19 to NB-18" })).toBeVisible();
  const rows = page.getByRole("table", { name: "Mock lane configuration" }).getByRole("row");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(2)).toContainText("NB-19");
  await page.getByRole("button", { name: "Change Channel 119 zone NB-19 to NB-18" }).click();
  await page.getByRole("button", { name: "Apply selected to mock configuration" }).click();
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(2)).toContainText("119");
  await expect(rows.nth(2)).toContainText("NB-18");
  await page.getByRole("button", { name: "Compare mock lanes" }).click();
  await expect(page.getByText("No changes recommended.")).toBeVisible();
  expect(requests).toEqual([]);
});
