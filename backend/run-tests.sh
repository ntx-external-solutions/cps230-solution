#!/bin/bash
# Script to run backend tests
cd "$(dirname "$0")"
./node_modules/.bin/jest
