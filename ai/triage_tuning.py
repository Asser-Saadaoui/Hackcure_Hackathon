"""Original pickle class definitions; inference only, no search or training entry point."""
import numpy as np
from sklearn.base import BaseEstimator,ClassifierMixin
from sklearn.linear_model import LogisticRegression
SEED=20261009

def dense_array(x):return x.toarray() if hasattr(x,'toarray') else x

class ThresholdModel(ClassifierMixin,BaseEstimator):
    """Fitted pipeline wrapper compatible with the existing predict_case() function."""
    def __init__(self,model,threshold=.5):self.model=model;self.threshold=threshold
    def predict_proba(self,x):return self.model.predict_proba(x)
    def predict(self,x):return (self.predict_proba(x)[:,1]>=self.threshold).astype('int8')
    @property
    def classes_(self):return np.array([0,1])

class ScoreCalibrator:
    """Post-hoc score mapping fitted on held-out weak labels, never medical risk."""
    def __init__(self,method='none'):self.method=method;self.estimator=None
    def fit(self,score,y):
        if self.method=='sigmoid':
            self.estimator=LogisticRegression(C=1e6,solver='lbfgs',max_iter=1000,random_state=SEED)
            self.estimator.fit(self._logit(score),y)
        elif self.method=='isotonic':
            from sklearn.isotonic import IsotonicRegression
            self.estimator=IsotonicRegression(out_of_bounds='clip',y_min=0,y_max=1).fit(score,y)
        elif self.method!='none':raise ValueError('Unknown calibration method.')
        return self
    @staticmethod
    def _logit(score):
        p=np.clip(np.asarray(score),1e-7,1-1e-7)
        return np.log(p/(1-p)).reshape(-1,1)
    def transform(self,score):
        if self.method=='sigmoid':return self.estimator.predict_proba(self._logit(score))[:,1]
        if self.method=='isotonic':return self.estimator.predict(score)
        return np.asarray(score)

class StateEnsemble(ThresholdModel):
    def __init__(self,model,calibrator,threshold=.5):
        super().__init__(model,threshold);self.calibrator=calibrator
    def predict_proba(self,x):
        p=self.calibrator.transform(self.model.predict_proba(x)[:,1])
        return np.column_stack([1-p,p])
