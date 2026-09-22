from lines import load
import re, json, difflib
SECTIONS=[
("2.1","Problem Simplification","Brain Teasers"),("2.2","Logic Reasoning","Brain Teasers"),("2.3","Thinking Out of the Box","Brain Teasers"),
("2.4","Application of Symmetry","Brain Teasers"),("2.5","Series Summation","Brain Teasers"),("2.6","The Pigeon Hole Principle","Brain Teasers"),
("2.7","Modular Arithmetic","Brain Teasers"),("2.8","Math Induction","Brain Teasers"),("2.9","Proof by Contradiction","Brain Teasers"),
("3.1","Limits and Derivatives","Calculus & Linear Algebra"),("3.2","Integration","Calculus & Linear Algebra"),
("3.3","Partial Derivatives and Multiple Integrals","Calculus & Linear Algebra"),("3.4","Important Calculus Methods","Calculus & Linear Algebra"),
("3.5","Ordinary Differential Equations","Calculus & Linear Algebra"),("3.6","Linear Algebra","Calculus & Linear Algebra"),
("4.1","Basic Probability Definitions and Set Operations","Probability Theory"),("4.2","Combinatorial Analysis","Probability Theory"),
("4.3","Conditional Probability and Bayes’ formula","Probability Theory"),("4.4","Discrete and Continuous Distributions","Probability Theory"),
("4.5","Expected Value, Variance & Covariance","Probability Theory"),("4.6","Order Statistics","Probability Theory"),
("5.1","Markov Chain","Stochastic Processes & Calculus"),("5.2","Martingale and Random Walk","Stochastic Processes & Calculus"),
("5.3","Dynamic Programming","Stochastic Processes & Calculus"),("5.4","Brownian Motion and Stochastic Calculus","Stochastic Processes & Calculus"),
("6.1","Option Pricing","Finance"),("6.2","The Greeks","Finance"),("6.3","Option Portfolios and Exotic Options","Finance"),("6.4","Other Finance Questions","Finance"),
("7.1","Algorithms","Algorithms & Numerical Methods"),("7.2","The Power of Two","Algorithms & Numerical Methods"),("7.3","Numerical Methods","Algorithms & Numerical Methods"),
]
WIN={ "2.1":(18,21),"2.2":(20,23),"2.3":(25,28),"2.4":(30,33),"2.5":(32,35),"2.6":(35,38),"2.7":(38,41),"2.8":(42,45),"2.9":(46,49),
"3.1":(48,51),"3.2":(51,54),"3.3":(55,58),"3.4":(56,59),"3.5":(61,64),"3.6":(65,68),"4.1":(74,77),"4.2":(79,82),"4.3":(87,90),"4.4":(101,104),
"4.5":(107,110),"4.6":(114,117),"5.1":(120,123),"5.2":(130,133),"5.3":(136,139),"5.4":(144,147),"6.1":(152,155),"6.2":(164,167),"6.3":(173,176),
"6.4":(178,181),"7.1":(186,189),"7.2":(197,200),"7.3":(199,202)}
out={}
for num,name,ch in SECTIONS:
    best=None
    lo,hi=WIN[num]
    for p in range(lo,hi+1):
        for l in load(p):
            t=l['text'].strip()
            if l['T']<60 or l['h']<36: continue
            r=difflib.SequenceMatcher(None,t.lower(),(num+' '+name).lower()).ratio()
            r2=difflib.SequenceMatcher(None,t.lower(),name.lower()).ratio()
            s=max(r,r2)
            if best is None or s>best[0]: best=(s,p,l['T'],l['B'],t)
    out[num]=dict(num=num,name=name,chapter=ch,page=best[1],T=best[2],B=best[3],match=best[4],score=round(best[0],2))
    print(num,name,'->',best[1],best[2],round(best[0],2),'|',best[4])
json.dump(out,open('sections.json','w'),indent=1)
