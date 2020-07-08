---
title: The folly of text
date: June 2020
...
# The folly of text

I'm an avid fan of Vim. I tried and failed to switch to VS Code. In the
aftermath I wanted to do some soul searching to understand why that was. After
all I didn't want to become a that guy who will never move past a text terminal.

The year is 2020[^1]. People are still having heated debates about whitespace,
convinced that their own flavor of hand typesetting code is better. We are still
drawing boxes using `+`, `-`, and `|`. Sure there's some UNICODE characters to
help, but somehow those don't render consistently enough to be useful. We can't
draw a diagram to explain something in a code comment. Most coders spend almost
their entire day looking at a monospaced font forsaking centuries of development
in beautiful typography[^2].

So no, I'm not a big fan of text editors. I use them all the time and find them
quite usable. But I think they are not where we as an industry want to be.

If I had my way, here's what would happen:

* Your editor is responsible for formatting and showing code to you in a manner
  that is to your liking. You don't have to rely on others to repeatedly hammer
  the space bar until the code looks nice on an 80-column terminal[^3]. Never
  mind those people who demand that you typeset things for their convenience.

  The editor is not the only tool you use to explore code. But the same can be
  true of any other tool that you use. Our tools are good at this sort of
  thing.

* Comments are more in the category of annotations. You aren't limited to
  placing comments above, below, or beside code. You can just annotate arbitrary
  snippets of code with cross links that don't go state every time some symbol
  gets renamed.

* Why not a real mathematical formula or two once in a while? Diagrams /
  pictures? Sure why not.

This is still pretty superficial. Coders of large codebases are still relegated
to curating deep directory trees full of source files that cannot be moved
without considerable pain. But why?

A hierarchical structure is a natural way to organize things. However, it
doesn't always lend itself to the complex dependency graphs that describe modern
large systems.

[^1]: This is going to look silly in 10 years and absolutely nothing has
  changed.

[^2]: Of course, there are superb monospaced fonts as well. But still.

[^3]: Why 80 columns? See [this post](https://softwareengineering.stackexchange.com/questions/148677/why-is-80-characters-the-standard-limit-for-code-width).
