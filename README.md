# Phaint

[Русская версия](README.ru.md) · [Download for macOS](https://github.com/pozitron57/phaint/releases/latest)

Phaint (physical paint) is a vector whiteboard inspired by MyPaint and Xournal++. Its drawing tools are designed for teaching physics.

- Draw on an infinite canvas.
- Assign your preferred keyboard shortcut to any tool.
- Open and edit SVGs from other apps. Move, rotate or stretch individual objects.
- Adjust how strongly pen pressure affects line width on a graphics tablet.
- Draw freehand, erase and highlight. Dedicated tools cover coordinate axes, parabolas, hyperbolas, sine waves, arrows, straight lines, Bézier curves, circles and ellipses.
- Adjust the grid spacing and snap objects to grid intersections.
- Annotate PDFs.
- Export the whole board or a selection to SVG, PDF, PNG or JPG. Adjust SVG and PDF compression to keep files small.

**Installation.** Phaint runs on Apple silicon and Intel Macs with macOS 13 Ventura or later.
Open the DMG and drag Phaint into Applications.
[Installation and user guide](docs/GUIDE.md)

![Default Mac shortcuts, with the drawing tools illustrated on their keys](docs/keyboard.svg)

To add a language, copy `src/locales/en.json` to a file named after the language code (for example, `fr.json`). Set `name` to the language’s own name, translate the messages and run `npm run check:locales`. The app discovers the new language at build time.

[User guide](docs/GUIDE.md) · [Technical specification in Russian](docs/SPEC.md) · [AGPL-3.0-or-later](LICENSE)
