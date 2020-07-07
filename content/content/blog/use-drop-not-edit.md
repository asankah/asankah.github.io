---
title: "Vim: Use Drop Not Edit, SBuffer Not Buffer"
date: 2020-07-07T12:02:20-04:00
tags:
  - Vim
  - CommandLine
  - Hacks
---

I'm going to assume you are a Vim user.

Say you have a several windows open in Vim and you want to edit another file.
Using `:edit` works if you want to open the file in the current window
unconditionally.

_But that's often not what you want._ If you have the same file open in another
window, then the most efficient and least disruptive thing to do is to switch to
that window.

## drop

That's where `:drop` comes in. In case you aren't familiar with the `drop`
command, have a look at the help page in your favorite editor (`:help drop`) or
[here on the web][vimdoc-drop]. But the gist of it is that for most people[^1] `:drop
{file}` will:

* Switch to the window in which `{file}` is already open.
* Switch the buffer in the current window to `{file}` otherwise.

The `:drop` command is intended to be used as the "open buffer" command for
automated tooling like source browsers. For example, you can configure
`coc-nvim` [GitHub](https://github.com/neoclide/coc.nvim) to use `:drop` as the
command used for opening a source file by setting `coc.preferences.jumpCommand`
to `drop`. See `:help coc-configuration` for details on how to set this, but
basically it's as simple as opening up the configuration using `:CocConfig` and
then adding a `"coc.preferences.jumpCommand": "drop",` mapping to the
configuration JSON file.

## switchbuf or swb

Or perhaps configuring each plugin is too much work. Enter `switchbuf`. This is
a global setting in Vim that controls how Vim switches between buffers.

Setting `set switchbuf=useopen` has the same effect when invoking `buffer`. Note
that using `sbuffer`, `sbnext`, or `sbrewind` automatically behaves as if this
is the case. I.e. they will use an existing window if one already has the buffer
open.


Setting `set switchbuf=usetab` is similar to the effect of `useopen` except that
it will look through windows in other tabs.

See `:help switchbuf` or [here on the web][vimdoc-switchbuf] for full details.

[^1]: Assuming you have `set hidden` that is. See `:help drop` for more details
  on what happens when the current buffer cannot be unloaded.

[vimdoc-drop]: http://vimdoc.sourceforge.net/htmldoc/windows.html#:drop
[vimdoc-switchbuf]: http://vimdoc.sourceforge.net/htmldoc/options.html#'switchbuf'
