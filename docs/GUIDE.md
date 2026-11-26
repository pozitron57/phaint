# Using Phaint

[Русский](GUIDE.ru.md) · [Keyboard cheat sheet](keyboard.svg) · [README](../README.md)

## Install on a Mac

Download the universal DMG, open it and drag **Phaint** onto **Applications**. Eject the disk image and launch Phaint from Applications. The same download runs natively on Apple silicon and Intel Macs with macOS 13 Ventura or later. A mouse or trackpad works too. Pen pressure was tested with a Wacom CTL-672. [GitHub Releases](https://github.com/pozitron57/phaint/releases/latest)

On first launch, choose **English** or **Русский**. To change the language for all windows, open **Phaint → Settings…** (**⌘,**), choose a language and click **Save**.

The release uses an ad-hoc signature and has no Apple notarization. If macOS blocks the first launch and you trust this download, try opening Phaint once, then go to **System Settings → Privacy & Security → Open Anyway** and confirm. Managed Macs may restrict this option. [Apple’s first-launch instructions](https://support.apple.com/en-us/102445)

## Draw a diagram during a lesson

1. Press **C**. Start where the vertical arrow should end and drag down and right to the tip of the horizontal arrow. Phaint draws both axes in one gesture.
2. Press **S** and drag sideways to draw a sine wave, or **P** for a parabola. For a parabola, drag between its endpoints, lift the pen, then drag again to set the bend.
3. Press **D** to write labels by hand. **Q**, **W** and **E** choose blue, red and green. **4** selects the highlighter. **Z** undoes the last change and **Y** redoes it.
4. Hold **Space** and move the pointer to pan. Pinch the trackpad or hold **Control** while scrolling to zoom. **0** resets the zoom and rotation.

| Key | What it draws |
| --- | --- |
| L / A / Shift+A | Straight line, arrow or double-ended arrow. Hold Shift while dragging for 15° increments. |
| O | Circle from its centre. Hold Shift during the drag for an ellipse. |
| H / Shift+H | A branch of a hyperbola or an adiabatic curve. The drag direction chooses the quadrant. |
| 1 / 2 / 3 | A solid, dashed or dotted stroke. F1 and F2 change the width. |
| ⌘⇧E | Eraser. Undo restores a whole erasing gesture. |

## Adjust the board

**X** selects an object. Drag a box around several objects, or ⌘-click to add or remove one. Drag inside the selection to move it, use a corner to resize or flip it, and drag the round handle to rotate. The arrow keys nudge selected objects. When the selection is empty, they pan the canvas. The coloured handles adjust shape parameters, such as the period of a sine wave. Press **B** for the current tool or selection settings.

**G** shows or hides the grid. **Shift+G** opens grid spacing, grid snapping and image snapping. A hidden grid can still snap. Option temporarily reverses grid snapping while drawing a shape. Press **V** to paste a clipboard image at the pointer, or **Option+V** for exact placement. Use **⌘C / ⌘V** to copy and paste selected objects.

**⌘⇧V** makes room between parts of a lesson. Touch the canvas and drag vertically to move objects entirely below that point. **N** or **Shift+B** hides or shows the toolbar. **⌘,** opens the searchable shortcut editor. Select an assignment, press your preferred keys and click **Save**. Shortcuts follow physical key positions in any keyboard layout.

## Save and share

- **⌘O** opens an SVG, image or PDF. External SVG paths can be edited separately. Some elements, including filter effects and complex groups, stay together as vector artwork. Embed external images in the SVG before opening it.
- **⌘S** saves the board as an editable SVG with pen pressure and shape parameters. With an active selection it saves those objects to a separate SVG. Press **Esc** first to save the whole board.
- **⌘E** exports the selection or the whole board as SVG, PDF, PNG or JPG. The dialog includes grid and compression options. For an annotated PDF, choose the original page layout to keep the pages and their vector content.
- **⌘T** opens a separate canvas. Each window keeps its own undo history and crash recovery. After an interruption, reopen Phaint and accept the recovery prompt.

## Build from source

On macOS, install Node.js 22.18 or later with npm and the Xcode Command Line Tools. Install the dependencies and launch Phaint from the repository root.

```sh
npm ci
npm start
```

`npm run dmg` creates the universal DMG in `release/<version>/`. To check a build, run `npm run typecheck`, `npm test` and `npm run e2e`. Regenerate both shortcut images with `npm run keyboard`.

Phaint is distributed under the GNU Affero General Public License, version 3 or any later version. Each release links to its matching source. The Mac app includes third-party notices in `Contents/Resources/Licenses`. The bundled MuPDF 1.28.6 source includes the WebAssembly build scripts in `platform/wasm`. [Phaint license](../LICENSE) · [MuPDF source and submodules](https://github.com/ArtifexSoftware/mupdf/tree/1.28.6)
