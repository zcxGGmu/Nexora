# C12 Visual QA Notes

Fresh screenshots captured from the temporary Mission Control preview on `127.0.0.1:4311` after the C12 UI edit.

## Captures

- `workflow-1440x900.png`: Workflow Studio desktop, 1440 x 900.
- `workflow-390x844.png`: Workflow Studio mobile, 390 x 844.
- `workflow-run-1440x900.png`: SEO Draft Run desktop, 1440 x 900.
- `workflow-run-390x844.png`: SEO Draft Run mobile, 390 x 844.

## Evidence Check

- `file artifacts/progress/c12/visual-qa/*.png`: all files are PNG images.
- `sips -g pixelWidth -g pixelHeight artifacts/progress/c12/visual-qa/*.png`: dimensions match requested viewports.
- Desktop pages preserve the existing shell, sidebar, evidence rail, token colors, and panel rhythm.
- Mobile pages preserve the five-item bottom nav and keep primary actions visible without text overlap.
