Getting started
================

Manually create the request-logger & pipeline stack in AWS CodeCommit.
Then proceed to push the code and perform the initial manual deploy

```bash
git clone github.com/npxcomplete/aws-request-logger-lambda ~/src/github.com/npxcomplete/aws-request-logger-lambda
git clone github.com/npxcomplete/aws-request-logger-pipeline ~/src/github.com/npxcomplete/aws-request-logger-lambda

cd ~/src/github.com/npxcomplete/aws-request-logger-lambda
git remote add aws ssh://<your aws account details here>/request-logger
git push aws main:main

cd ~/src/github.com/npxcomplete/aws-request-logger-pipeline
git remote add aws ssh://<your aws account details here>/pipeline
git push aws main:main

export AWS_ACCESS_KEY_ID=.....
export AWS_SECRET_ACCESS_KEY=......
export AWS_DEFAULT_REGION=us-east-2

cdk bootstrap
# Manual code edit required before first deploy
# comment the Fn.Import in the verify step.
./bin/release && cdk deploy PipelineStack
# On re-execution (with the Fn.Import present) the verify step should pass.
```

