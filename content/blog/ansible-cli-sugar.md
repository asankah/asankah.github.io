---
title: "Easier CLI for ad-hoc Ansible tasks and playbooks"
date: 2020-06-01
summary: |
  Encode the host and group names into the name of a wrapper script for quick
  ad-hoc invocation of Ansible tasks and playbooks.
tags:
  - CommandLine
  - Hacks
---
This article is about using [Ansible](https://ansible.com) on the command-line.

## Problem:

You ...

* ... want a convenient way to do ad-hoc tasks on a bunch of machines.

* ... already have a few playbooks and machine groups defined in your inventory.

* ... don't want to invest too much into Ansible because you have other things
  to do and Ansible is just a tool to deal with one aspect of what you want to
  do.

* ... live on the command-line.

* ... think `ansible-playbook` and `ansible` commands have too many knobs and
  too few knobs at the same time.

## A Possible Solution

Taking a page from old school Posix tools, let's make a script that encodes
Ansible group names into the filename.

Then you can go from this:

```sh
$ ansible atlanta -m copy -a "src=/etc/hosts dest=/tmp/hosts"
$ ansible webservers -m service -a "name=httpd state=started"
```

To this:


```sh
$ atlanta copy "src=/etc/hosts dest=/tmp/hosts"
$ webservers service "name=https state=started"
```

Or from this:

```sh
$ ansible-playbook -l atlanta go-to-the-moon
$ ansible-playbook -l webservers do-the-other-things
```

To this:

```sh
$ atlanta go-to-the-moon
$ webservers do-the-other-things
```

## Setting Up

These are just examples. Please don't spend time bikeshedding names because you
can use whichever names you like.

1. Download the contents of `ansible-by-proxy` from
   [here](https://github.com/asankah/ansible-cli-sugar/blob/master/ansible-by-proxy).
   It's a starter script that includes a bunch of sensible settings expressed
   via environment variables. Remove or change these to match your needs.

   Note that the script expects to find a sub-directory called `ansible` in the
   same directory as the script which contains the playbooks and the inventory
   file.

2. Store this file somewhere on the system `PATH`.

   Don't forget to mark the file as executable if it isn't already.

   ```sh
   $ chmod +x ansible-by-proxy
   ```

3. Create symlinks to the file that have the same name as hostnames or groups as
   described in the includes:

   ```sh
   $ ln -s ansible-by-proxy atlanta
   $ ln -s ansible-by-proxy webservers
   ```

   and so on.

That's it. Now you can invoke playbooks and tasks just by using the name of host
or group.

