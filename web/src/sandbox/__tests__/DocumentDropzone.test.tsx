import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DocumentDropzone } from "../DocumentDropzone";

function makeFile(name: string, size = 1024, type = "application/pdf"): File {
  const f = new File([new Uint8Array(size)], name, { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
}

describe("<DocumentDropzone>", () => {
  it("lists provided files with a remove button per row", () => {
    const onChange = vi.fn();
    const files = [makeFile("brief.pdf", 2048), makeFile("notes.md", 512)];
    render(<DocumentDropzone files={files} onChange={onChange} />);
    const list = screen.getByTestId("document-dropzone-list");
    expect(list.querySelectorAll("li")).toHaveLength(2);
    expect(screen.getByText("brief.pdf")).toBeInTheDocument();
    expect(screen.getByText("notes.md")).toBeInTheDocument();
  });

  it("removes a file by index when the remove button is clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const files = [makeFile("a.pdf"), makeFile("b.pdf")];
    render(<DocumentDropzone files={files} onChange={onChange} />);
    await user.click(screen.getByLabelText("Remove a.pdf"));
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0]![0] as File[];
    expect(next.map((f) => f.name)).toEqual(["b.pdf"]);
  });

  it("filters incoming files by accept extensions and dedupes by name+size", () => {
    const onChange = vi.fn();
    const existing = [makeFile("keep.pdf", 100)];
    render(
      <DocumentDropzone
        files={existing}
        onChange={onChange}
        accept={[".pdf", ".md"]}
      />,
    );
    const input = screen.getByTestId("document-dropzone-input") as HTMLInputElement;
    const dupe = makeFile("keep.pdf", 100);
    const fresh = makeFile("new.md", 200);
    const rejected = makeFile("evil.exe", 300);
    Object.defineProperty(input, "files", {
      value: [dupe, fresh, rejected] as unknown as FileList,
      configurable: true,
    });
    fireEvent.change(input);
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0]![0] as File[];
    expect(next.map((f) => f.name).sort()).toEqual(["keep.pdf", "new.md"]);
  });

  it("does not accept files when disabled", () => {
    const onChange = vi.fn();
    render(<DocumentDropzone files={[]} onChange={onChange} disabled />);
    const input = screen.getByTestId("document-dropzone-input") as HTMLInputElement;
    expect(input).toBeDisabled();
  });
});
