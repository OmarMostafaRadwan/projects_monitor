# Screenshots

Images in this folder are sent to the dashboard on every push and shown on the
project's page, next to its README and push history. They are how someone who
will never run this project sees what it looks like.

## Naming

One image per page or main view, numbered so they sort into the order a person
meets them:

```
docs/screenshots/
  01-sign-in.png
  02-overview.png
  03-project-detail.png
```

The number prefix decides the display order. The rest of the name is shown as
the caption, so make it describe the view.

## Keeping them true

This folder is the source of truth. Whatever is here replaces whatever the
dashboard has, so:

- add an image when you add a page,
- replace the ones whose screen you changed,
- delete the file when the page goes away — it disappears from the dashboard too.

A stale screenshot is worse than a missing one, because it is believed.

## Limits

PNG, JPEG, WebP or GIF. Up to 2 MB per image, 12 images, 10 MB in total.
Anything over a limit is skipped with a warning in the Action log; it never
fails the push.
