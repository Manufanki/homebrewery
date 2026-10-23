# The Homebrewery

[![Homebrewery](https://circleci.com/gh/naturalcrit/homebrewery/tree/master.svg?style=svg)](https://app.circleci.com/pipelines/github/naturalcrit/homebrewery?branch=master)

The Homebrewery is a tool for making authentic looking [D&D content][dnd-content-url]
using [Markdown][markdown-url]. It is distributed under the terms of the [MIT License](./license).

[dnd-content-url]: https://dnd.wizards.com/products/tabletop-games/rpg-products/rpg_playershandbook
[markdown-url]: https://github.com/adam-p/markdown-here/wiki/Markdown-Cheatsheet

## Quick Start
The easiest way to get started using The Homebrewery is to use it
[on our website][homebrewery-url]. The code is open source, so feel free to
clone it and tinker with it. If you want to make changes to the code, you can run
your own local version for testing by following the installation instructions
below.

[homebrewery-url]: https://homebrewery.naturalcrit.com

### Installation
The project requires [Node.js](https://nodejs.org/en/) 26.4 or newer and npm
10.8 or newer, but below 12. Install [Git](https://git-scm.com/downloads) to clone the repo.
MongoDB Community is optional; it is only used by the database-backed `npm
start` mode. The local Markdown file mode does not require MongoDB.

Checkout the repo ([documentation][github-clone-repo-docs-url]):
```
git clone https://github.com/Manufanki/homebrewery.git
```

Install dependencies from the repository directory:

```sh
npm install
```

#### Local Markdown file mode (no MongoDB)

```sh
npm run start:files
```

Open http://localhost:8000. This mode uses `../markdown` by default and stores
your brews as Markdown files. See [Local Markdown File Mode](#local-markdown-file-mode-no-mongodb)
below for folder configuration and supported workflows.

#### Database-backed mode

Install and start [MongoDB Community](https://www.mongodb.com/try/download/community),
then set `NODE_ENV=local` before starting the server. For example, in PowerShell:

```powershell
$env:NODE_ENV = 'local'
npm start
```

On first startup, the app creates the database indexes it needs. This can take
a few moments, depending on the amount of data in the local database.

[github-clone-repo-docs-url]: https://docs.github.com/en/free-pro-team@latest/github/creating-cloning-and-archiving-repositories/cloning-a-repository

If you had any issue at all, here are some links that may be useful:
- [Course](https://learn.mongodb.com/courses/m103-basic-cluster-administration) on cluster administration, useful for beginners
- [Mongo community forums](https://www.mongodb.com/community/forums/)
- Useful Stack Overflow links for your most probable errors: [1](https://stackoverflow.com/questions/44962540/mongod-and-mongo-commands-not-working-on-windows-10), [2](https://stackoverflow.com/questions/15053893/mongo-command-not-recognized-when-trying-to-connect-to-a-mongodb-server/41507803#41507803), [3](https://stackoverflow.com/questions/51224959/mongo-is-not-recognized-as-an-internal-or-external-command-operable-program-o)

If you still have problems, post in [Our Subreddit](https://www.reddit.com/r/homebrewery/) and we will help you.

### Running the application via Docker

Please see the docs here: [README.DOCKER.md](./README.DOCKER.md)

### Automatic Pagination

The preview now uses Paged.js to flow rendered content through columns and onto
new physical pages. It recalculates after text edits, file reloads, theme or CSS
changes, and font loading. Images are loaded before layout; large images are
constrained to the available page area. The current page width, height, padding,
column count, and column gap are taken from the document's styles.

Automatic breaks exist only in the rendered preview and PDF. The Markdown is
not rewritten, and no `\page` or `\column` markers are inserted when saving.
Existing explicit page and column breaks remain supported. Paragraphs, long
tables, and oversized stat blocks can continue across generated pages; blocks
are kept together when they fit. Printing waits for the latest layout to finish.

Custom cover designs, absolute-positioned artwork, and page-specific selectors
can require layout adjustments. Review the generated preview before exporting.

### Local Markdown File Mode (No MongoDB)

After installing dependencies, start the local file editor from this directory:

```powershell
npm run start:files
```

Open http://localhost:8000. The home page lists `.md` files recursively in
`../markdown` (relative to the Homebrewery directory). Open a file to edit it,
or use **new file** to create one. Saves and autosaves write directly to that
file. MongoDB, accounts, Google Drive, the vault, and database-backed custom
themes are not used. The original `npm start` database mode remains available.

To choose another folder in PowerShell:

```powershell
$env:HB_FILES = 'C:\Documents\MyBrews'
npm run start:files
```

Or pass `--hb_files` to the command:

```powershell
npm run start:files -- --hb_files="C:\Documents\MyBrews" --web_port=8001
```

Relative image links such as `![Art](assets/example.png)` resolve relative to
the Markdown file's folder, including for nested files. Images and fonts are
served from the selected folder; no asset upload or URL rewriting is needed.
Files can be downloaded as Markdown using the download action.

Saving adds Homebrewery's fenced `metadata` and optional `css` sections to the
Markdown file, preserving the body, theme, language, snippets, and styles.
Keep this folder backed up or under version control. If a file changes on disk
after it was opened, saving is refused rather than overwriting the external
edit. Use **Reload from disk** (the circular-arrow button) to load external
changes into the editor and preview. It asks for confirmation before discarding
unsaved browser edits.

The **auto sync** toggle checks the open file every two seconds and when the
browser regains focus. It updates the editor and preview after external edits
and remembers its on/off setting. Auto sync pauses while there are unsaved
browser edits or a save is in progress; it does not merge conflicting edits.
This is separate from autosave, which writes browser edits to disk.
Refresh the file list to discover files added outside Homebrewery.

File mode binds to `127.0.0.1` and is intended for trusted local documents only.
Paths are restricted to the selected folder, symbolic links are rejected,
and existing files cannot be overwritten when creating a new document.

### Running the application on FreeBSD or FreeNAS

Please see the docs here: [README.FreeBSD.md](./README.FREEBSD.md)

### Standalone PHB Stylesheet
If you just want the stylesheet that is generated to make pages look like they
are from the Player's Handbook, you will find it in the
[phb.standalone.css](./phb.standalone.css) file.

If you are developing locally and would like to generate your own, follow the
above steps and then run `npm run phb`.

## Issues, Suggestions, and Bugs
If you run into any issues using The Homebrewery or have suggestions for
improvement, please submit an issue [on GitHub][repo-issues-url].
You can also get help for issues on the subreddit [r/homebrewery][subreddit-url]

[repo-issues-url]: https://github.com/naturalcrit/homebrewery/issues
[subreddit-url]: https://www.reddit.com/r/homebrewery

## Changelog

You can check out the [changelog](./changelog.md).

## License

This project is licensed under the [MIT license](./license), which means you
are free to use The Homebrewery in any way that you want, except for claiming
that you made it yourself.

If you wish to sell, or in some way gain profit for, what's created on this site,
it's your responsibility to ensure you have the proper licenses/rights for any
images or resources used.

## Contributing

You are welcome to contribute to the development and maintenance of the
project! There are several ways of doing that:
- At the moment, we have a huge backlog of [issues][repo-issues-url] and some
  of them are outdated, duplicates, or don't contain any useful info. To help, you can [mark duplicates][github-mark-duplicate-url], try to
  reproduce some complex or weird issues, try finding a workaround for a
  reported bug, or just mention our issue managers team to let them know about
  outdated issues via `@naturalcrit/issue-managers`.
- Our [subreddit][subreddit-url] is constantly growing and there are number of
  bug reports. Any help with sorting them out is very welcome.
- And of course you can contribute by fixing a bug or implementing a new
  feature by yourself, we are waiting for your
  [pull requests][github-pr-docs-url]!

Anyway, if you would like to get in touch with the team and discuss/coordinate
your contribution to the project, please join our [gitter chat][gitter-url].

[github-mark-duplicate-url]: https://docs.github.com/en/free-pro-team@latest/github/managing-your-work-on-github/about-duplicate-issues-and-pull-requests
[github-pr-docs-url]: https://docs.github.com/en/free-pro-team@latest/github/collaborating-with-issues-and-pull-requests/creating-a-pull-request
[gitter-url]: https://gitter.im/naturalcrit/Lobby


