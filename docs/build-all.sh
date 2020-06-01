#!/usr/bin/env bash

BASEDIR=$(dirname "$0")
sh $BASEDIR/build.sh
(cd $BASEDIR/../../identity-domains/docs && sh build.sh)
(cd $BASEDIR/../../ephemeral-fingerprinting/docs && sh build.sh)
