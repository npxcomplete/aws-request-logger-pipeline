#!/usr/bin/env node

const CODECOMMIT_REPO_NAME = "pipeline";

import { App } from '@aws-cdk/core';
import { RequestLoggerStack } from './lib/lambda-stack';
import { PipelineStack } from './lib/pipeline-stack';

const app = new App();

const lambdaStack = new RequestLoggerStack(app, 'LambdaStack');
const pipeline = new PipelineStack(app, 'PipelineStack', {
    lambdaArtifact: lambdaStack.codeArtifact,
    repoName: CODECOMMIT_REPO_NAME
});

app.synth();