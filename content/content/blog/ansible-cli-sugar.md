---
title: "A new way to work with Ansible on the command line"
date: 2020-06-01
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

* ... `ansible-playbook` and `ansible` commands have too many knobs and too few
  knobs at the same time.

## Possible solution

Taking a page from old school Posix tools, let's make a script that encodes
Ansible group names into the filename.

E.g.: Instead of:

```sh
$ ansible atlanta -m copy -a "src=/etc/hosts dest=/tmp/hosts"
$ ansible webservers -m service -a "name=httpd state=started"
```

You could do:

```sh
$ atlanta copy "src=/etc/hosts dest=/tmp/hosts"
$ webservers service "name=https state=started"
```

E.g. Or better, instead of:

```sh
$ ansible-playbook -l atlanta go-to-the-moon
$ ansible-playbook -l webservers do-the-other-things
```

You could say:

```sh
$ atlanta go-to-the-moon
$ webservers do-the-other-things
```

## Setting it up

These are just examples. Please don't spend time bikeshedding names because you
can use whichever names you like.

1. Start with a file called `ansible-by-proxy` which looks like
   [this](https://github.com/asankah/ansible-cli-sugar/blob/master/ansible-by-proxy).
   Feel free to modify it to suit your environment.

   Note that the script expects to find a sub-directory called `ansible` in the
   same directory as the script which contains the playbooks and the inventory
   file.

2. Store this file somewhere on the system `PATH`.

   Don't forget to mark the file as executable if it isn't already.

   ```sh
   $ chmod +x ansible-by-proxy
   ```

3. In that same directory, create symlinks to the file that have the same name
   as:

   ```sh
   $ ln -s ansible-by-proxy atlanta
   $ ln -s ansible-by-proxy webservers
   ```

   and so on.

That's it. Now you can invoke playbooks and tasks just by using the name of host
or group.


