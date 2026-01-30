#!/bin/bash

yarn test:setup
yarn test
yarn dc:down -v
