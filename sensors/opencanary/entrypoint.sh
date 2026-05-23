#!/bin/sh
set -e

# OpenCanary reads config from ~/.opencanary.conf by default
cp /etc/opencanary/opencanary.conf ~/.opencanary.conf

exec opencanaryd --dev
