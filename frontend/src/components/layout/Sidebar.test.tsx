import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";

import { Sidebar } from "@/components/layout/Sidebar";

test("shows the project's pages once a project is on the laptop", () => {
  const { rerender } = render(
    <MemoryRouter>
      <Sidebar email={null} hasBundle={false} />
    </MemoryRouter>,
  );
  expect(screen.getByRole("link", { name: "Server" })).toHaveAttribute("href", "/setup");
  expect(screen.queryByRole("link", { name: "Files" })).not.toBeInTheDocument();
  expect(screen.getByText("Not signed in")).toBeInTheDocument();
  rerender(
    <MemoryRouter>
      <Sidebar email="ranger@example.org" hasBundle onSignOut={() => undefined} />
    </MemoryRouter>,
  );
  expect(screen.getByRole("link", { name: "Files" })).toHaveAttribute("href", "/files");
  expect(screen.getByRole("link", { name: "Data explorer" })).toHaveAttribute("href", "/explore");
  expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
});
