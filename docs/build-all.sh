#!/usr/bin/env bash

BASEDIR=$(dirname "$0")
sh $BASEDIR/build.sh
git commit -a -m 'formatting'
git push
(cd $BASEDIR/../../identity-domains/docs && sh build.sh && git commit -a -m 'formatting' && git push)
(cd $BASEDIR/../../ephemeral-fingerprinting/docs && sh build.sh && git commit -a -m 'formatting' && git push)
(cd $BASEDIR/../../ansible-cli-sugar/docs && sh build.sh && git commit -a -m 'formatting' && git push)
