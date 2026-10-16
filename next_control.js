kind => {
          const visible=e=>!!e.getClientRects().length && getComputedStyle(e).visibility!=='hidden';
          const candidates=[...document.querySelectorAll('button,a,[role="button"],.next-question,.pagination-next,[aria-label="Next"],.question-list-pager .houpage')].filter(e=>{
            if(!visible(e)||e.closest('[disabled],[aria-disabled="true"],.disabled,.ant-pagination-disabled'))return false;
            if(kind==='list' && e.matches('.question-list-pager .houpage')) {
              const pager=e.closest('.paging');
              if(!pager) return false;
              const current=Number(pager.querySelector('.item.active')?.innerText);
              const numbers=[...pager.querySelectorAll('.item')].map(n=>Number(n.innerText.trim())).filter(n=>Number.isInteger(n)&&n>0);
              return current>0 && numbers.length>0 && current<Math.max(...numbers);
            }
            const text=(e.innerText||e.getAttribute('aria-label')||'').trim();
            return kind==='question' ? e.matches('.next-question')||/^下一题(?:\s*[>›»])?$/.test(text) : e.matches('.pagination-next,[aria-label="Next"],.question-list-pager .houpage')||/^(下一页|Next)(?:\s*[>›»])?$/.test(text);
          });
          const leaves=candidates.filter(e=>!candidates.some(other=>other!==e&&e.contains(other)));
          for(const e of document.querySelectorAll('[data-fenbi-next-control]'))e.removeAttribute('data-fenbi-next-control');
          if(leaves.length===1)leaves[0].setAttribute('data-fenbi-next-control','1');
          return leaves.length;
        }
