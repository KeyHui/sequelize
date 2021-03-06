'use strict';

var chai = require('chai')
  , expect = chai.expect
  , Support = require(__dirname + '/support')
  , DataTypes = require(__dirname + '/../../lib/data-types')
  , SequelizePromise = require(__dirname + '/../../lib/promise')
  , dialect = Support.getTestDialect()
  , _ = require('lodash')
  , sinon = require('sinon');

chai.config.includeStack = true;

describe(Support.getTestDialectTeaser('Promise'), function() {
  beforeEach(function() {
    return Support.prepareTransactionTest(this.sequelize).bind(this).then(function(sequelize) {
      this.sequelize = sequelize;
      this.User = this.sequelize.define('User', {
        username: { type: DataTypes.STRING },
        touchedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
        aNumber: { type: DataTypes.INTEGER },
        bNumber: { type: DataTypes.INTEGER },

        validateTest: {
          type: DataTypes.INTEGER,
          allowNull: true,
          validate: {isInt: true}
        },
        validateCustom: {
          type: DataTypes.STRING,
          allowNull: true,
          validate: {len: {msg: 'Length failed.', args: [1, 20]}}
        },

        dateAllowNullTrue: {
          type: DataTypes.DATE,
          allowNull: true
        }
      });

      return this.User.sync({ force: true });
    });
  });

  describe('increment', function() {
    beforeEach(function(done) {
      this.User.create({ id: 1, aNumber: 0, bNumber: 0 }).done(done);
    });

    it('with array', function(done) {
      var self = this;

      this.User
        .find(1)
        .then(function(user) {
          expect(user.id).to.equal(1);
          return user.increment(['aNumber'], { by: 2 });
        })
        .then(function(user) {
          // The following assertion would rock hard, but it's not implemented :(
          // expect(user.aNumber).to.equal(2)
          return self.User.find(1);
        })
        .then(function(user) {
          expect(user.aNumber).to.equal(2);
          done();
        });
    });

    it('should still work right with other concurrent updates', function(done) {
      var self = this;

      // Select something
      this.User
        .find(1)
        .then(function(user1) {
        // Select the user again (simulating a concurrent query)
          return self.User.find(1)
            .then(function(user2) {
              return user2
                .updateAttributes({ aNumber: user2.aNumber + 1 })
                .then(function() { return user1.increment(['aNumber'], { by: 2 }); })
                .then(function() { return self.User.find(1); })
                .then(function(user5) {
                  expect(user5.aNumber).to.equal(3);
                  done();
                });
            });
        });
    });

    it('with key value pair', function(done) {
      var self = this;

      this.User
        .find(1)
        .then(function(user1) {
          return user1.increment({ 'aNumber': 1, 'bNumber': 2});
        })
        .then(function() {
          return self.User.find(1);
        })
        .then(function(user3) {
          expect(user3.aNumber).to.equal(1);
          expect(user3.bNumber).to.equal(2);
          done();
        });
    });
  });

  describe('decrement', function() {
    beforeEach(function(done) {
      this.User.create({ id: 1, aNumber: 0, bNumber: 0 }).done(done);
    });

    it('with array', function(done) {
      var self = this;

      this.User
        .find(1)
        .then(function(user1) {
          return user1.decrement(['aNumber'], { by: 2 });
        })
        .then(function(user2) {
          return self.User.find(1);
        })
        .then(function(user3) {
          expect(user3.aNumber).to.equal(-2);
          done();
        });
    });

    it('with single field', function(done) {
      var self = this;

      this.User
        .find(1)
        .then(function(user1) {
          return user1.decrement(['aNumber'], { by: 2 });
        })
        .then(function(user3) {
          return self.User.find(1);
        })
        .then(function(user3) {
          expect(user3.aNumber).to.equal(-2);
          done();
        });
    });

    it('should still work right with other concurrent decrements', function(done) {
      var self = this;

      this.User
        .find(1)
        .then(function(user1) {
          var _done = _.after(3, function() {
            self.User
              .find(1)
              .then(function(user2) {
                expect(user2.aNumber).to.equal(-6);
                done();
              });
          });

          user1.decrement(['aNumber'], { by: 2 }).done(_done);
          user1.decrement(['aNumber'], { by: 2 }).done(_done);
          user1.decrement(['aNumber'], { by: 2 }).done(_done);
        });
      });
  });

  describe('reload', function() {
    it('should return a reference to the same DAO instead of creating a new one', function(done) {
      this.User
        .create({ username: 'John Doe' })
        .then(function(originalUser) {
          return originalUser
            .updateAttributes({ username: 'Doe John' })
            .then(function() {
              return originalUser.reload();
            })
            .then(function(updatedUser) {
              expect(originalUser === updatedUser).to.be.true;
              done();
            });
        });
    });

    it('should update the values on all references to the DAO', function(done) {
      var self = this;

      this.User
        .create({ username: 'John Doe' })
        .then(function(originalUser) {
          return self.User
            .find(originalUser.id)
            .then(function(updater) {
              return updater.updateAttributes({ username: 'Doe John' });
            })
            .then(function() {
              // We used a different reference when calling updateAttributes, so originalUser is now out of sync
              expect(originalUser.username).to.equal('John Doe');
              return originalUser.reload();
            }).then(function(updatedUser) {
              expect(originalUser.username).to.equal('Doe John');
              expect(updatedUser.username).to.equal('Doe John');
              done();
            });
        });
    });


    it('should update the associations as well', function(done) {
      var Book = this.sequelize.define('Book', { title: DataTypes.STRING })
        , Page = this.sequelize.define('Page', { content: DataTypes.TEXT });

      Book.hasMany(Page);
      Page.belongsTo(Book);

      Book
        .sync({ force: true })
        .then(function() {
          Page
            .sync({ force: true })
            .then(function() {
              return Book.create({ title: 'A very old book' });
            })
            .then(function(book) {
              return Page
                .create({ content: 'om nom nom' })
                .then(function(page) {
                  return book
                    .setPages([page])
                    .then(function() {
                      return Book
                        .find({
                          where: {id: book.id},
                          include: [Page]
                        })
                        .then(function(leBook) {
                          return page
                            .updateAttributes({ content: 'something totally different' })
                            .then(function(page) {
                              expect(leBook.Pages[0].content).to.equal('om nom nom');
                              expect(page.content).to.equal('something totally different');

                              return leBook
                                .reload()
                                .then(function(leBook) {
                                  expect(leBook.Pages[0].content).to.equal('something totally different');
                                  expect(page.content).to.equal('something totally different');
                                  done();
                                });
                            });
                        });
                    });
                });
            }, done);
        });
    });
  });

  describe('complete', function() {
    it('gets triggered if an error occurs', function(done) {
      this.User.find({ where: 'asdasdasd' }).then(null, function(err) {
        expect(err).to.be.ok;
        expect(err.message).to.be.ok;
        done();
      });
    });

    it('gets triggered if everything was ok', function(done) {
      this.User.count().then(function(result) {
        expect(result).to.not.be.undefined;
        done();
      });
    });
  });

  describe('save', function() {
    it('should fail a validation upon creating', function(done) {
      this.User.create({aNumber: 0, validateTest: 'hello'})
        .catch (function(err) {
          expect(err).to.be.ok;
          expect(err).to.be.an('object');
          expect(err.get('validateTest')).to.be.an('array');
          expect(err.get('validateTest')[0]).to.be.ok;
          expect(err.get('validateTest')[0].message).to.equal('Validation isInt failed');
          done();
        });
    });

    it('should fail a validation upon building', function(done) {
      this.User.build({aNumber: 0, validateCustom: 'aaaaaaaaaaaaaaaaaaaaaaaaaa'}).save()
        .catch (function(err) {
          expect(err).to.be.ok;
          expect(err).to.be.an('object');
          expect(err.get('validateCustom')).to.be.ok;
          expect(err.get('validateCustom')).to.be.an('array');
          expect(err.get('validateCustom')[0]).to.be.ok;
          expect(err.get('validateCustom')[0].message).to.equal('Length failed.');
          done();
        });
    });

    it('should fail a validation when updating', function(done) {
      this.User.create({aNumber: 0}).then(function(user) {
        return user.updateAttributes({validateTest: 'hello'});
      }).catch (function(err) {
        expect(err).to.be.ok;
        expect(err).to.be.an('object');
        expect(err.get('validateTest')).to.be.ok;
        expect(err.get('validateTest')).to.be.an('array');
        expect(err.get('validateTest')[0]).to.be.ok;
        expect(err.get('validateTest')[0].message).to.equal('Validation isInt failed');
        done();
      });
    });
  });

  describe('findOrCreate', function() {
    beforeEach(function(done) {
      this.User.create({ id: 1, aNumber: 0, bNumber: 0 }).done(done);
    });

    describe('with spread', function() {
      it('user not created', function(done) {
        this.User
          .findOrCreate({ where: { id: 1}})
          .spread(function(user, created) {
            expect(user.id).to.equal(1);
            expect(created).to.equal(false);
            expect(arguments.length).to.equal(2);
            done();
          });
      });

      it('user created', function(done) {
        this.User
          .findOrCreate({ where: { id: 2}})
          .spread(function(user, created) {
            expect(user.id).to.equal(2);
            expect(created).to.equal(true);
            expect(arguments.length).to.equal(2);
            done();
          });
      });
    });
  });

  describe('backwards compat', function() {
    it('should still work with .complete() when resolving', function(done) {
      var spy = sinon.spy()
        , promise = new SequelizePromise(function(resolve, reject) {
          resolve('abc');
        });

      promise.complete(spy);
      promise.then(function() {
        expect(spy.calledOnce).to.be.true;
        expect(spy.firstCall.args).to.deep.equal([null, 'abc']);
        done();
      });
    });

    it('should still work with .success() when resolving', function(done) {
      var spy = sinon.spy()
        , promise = new SequelizePromise(function(resolve, reject) {
          resolve('yay');
        });

      promise.success(spy);
      promise.then(function() {
        expect(spy.calledOnce).to.be.true;
        expect(spy.firstCall.args).to.deep.equal(['yay']);
        done();
      });
    });

    it('should still work with .on(\'success\') when resolving', function(done) {
      var spy = sinon.spy()
        , promise = new SequelizePromise(function(resolve, reject) {
          resolve('yoohoo');
        });

      promise.on('success', spy);
      promise.then(function() {
        expect(spy.calledOnce).to.be.true;
        expect(spy.firstCall.args).to.deep.equal(['yoohoo']);
        done();
      });
    });

    it('should still work with .done() when resolving multiple results', function(done) {
      var spy = sinon.spy()
        , promise = new SequelizePromise(function(resolve, reject) {
          resolve(SequelizePromise.all(['MyModel', true]));
        });

      promise.spread(spy);
      promise.done(function(err, model, created) {
        expect(model).to.equal('MyModel');
        expect(created).to.be.true;
        expect(spy.calledOnce).to.be.true;
        expect(spy.firstCall.args).to.deep.equal(['MyModel', true]);
        done();
      });
    });

    it('should still work with .complete() after chaining', function(done) {
      var spy = sinon.spy()
        , promise = new SequelizePromise(function(resolve, reject) {
          resolve('Heyo');
        });

      promise.then(function(result) {
        return result + '123';
      }).complete(function(err, result) {
        expect(err).not.to.be.ok;
        expect(result).to.equal('Heyo123');
        done();
      });
    });

    it('should still work with .success() when emitting', function(done) {
      var spy = sinon.spy()
        , promise = new SequelizePromise(function(resolve, reject) {
          // no-op
        });

      promise.success(spy);
      promise.then(function() {
        expect(spy.calledOnce).to.be.true;
        expect(spy.firstCall.args).to.deep.equal(['yay']);
        done();
      });

      promise.emit('success', 'yay');
    });

    it('should still work with .done() when rejecting', function(done) {
      var spy = sinon.spy()
        , promise = new SequelizePromise(function(resolve, reject) {
          reject(new Error('no'));
        });

      promise.done(spy);
      promise.catch(function() {
        expect(spy.calledOnce).to.be.true;
        expect(spy.firstCall.args[0]).to.be.an.instanceof(Error);
        done();
      });
    });

    it('should still work with .error() when throwing', function(done) {
      var spy = sinon.spy()
        , promise = new SequelizePromise(function(resolve, reject) {
          throw new Error('no');
        });

      promise.error(spy);
      promise.catch(function() {
        expect(spy.calledOnce).to.be.true;
        expect(spy.firstCall.args[0]).to.be.an.instanceof(Error);
        done();
      });
    });

    it('should still work with .on(\'error\') when throwing', function(done) {
      var spy = sinon.spy()
        , promise = new SequelizePromise(function(resolve, reject) {
          throw new Error('noway');
        });

      promise.on('error', spy);
      promise.catch(function() {
        expect(spy.calledOnce).to.be.true;
        expect(spy.firstCall.args[0]).to.be.an.instanceof(Error);
        done();
      });
    });

    it('should still work with .error() when emitting', function(done) {
      var spy = sinon.spy()
        , promise = new SequelizePromise(function(resolve, reject) {
          // no-op
        });

      promise.on('error', spy);
      promise.catch(function() {
        expect(spy.calledOnce).to.be.true;
        expect(spy.firstCall.args[0]).to.be.an.instanceof(Error);
        done();
      });

      promise.emit('error', new Error('noway'));
    });

    it('should still support sql events', function(done) {
      var spy = sinon.spy()
        , promise = new SequelizePromise(function(resolve, reject) {
          resolve('yay');
        });

      promise.on('sql', spy);

      promise.emit('sql', 'SQL STATEMENT 1');
      promise.emit('sql', 'SQL STATEMENT 2');

      promise.then(function() {
        expect(spy.calledTwice).to.be.true;
        done();
      });
    });

    describe('proxy', function() {
      it('should correctly work with success listeners', function(done) {
        var emitter = new SequelizePromise(function() {})
          , proxy = new SequelizePromise(function() {})
          , success = sinon.spy();

        emitter.success(success);
        proxy.success(function() {
          process.nextTick(function() {
            expect(success.called).to.be.true;
            done();
          });
        });

        proxy.proxy(emitter);
        proxy.emit('success');
      });

      it('should correctly work with complete/done listeners', function(done) {
        var promise = new SequelizePromise(function() {})
          , proxy = new SequelizePromise(function() {})
          , complete = sinon.spy();

        promise.complete(complete);
        proxy.complete(function() {
          process.nextTick(function() {
            expect(complete.called).to.be.true;
            done();
          });
        });

        proxy.proxy(promise);
        proxy.emit('success');
      });
    });

    describe('when emitting an error event with an array of errors', function() {
      describe('if an error handler is given', function() {
        it('should return the whole array', function(done) {
          var emitter = new SequelizePromise(function() {});
          var errors = [
            [
              new Error('First error'),
              new Error('Second error')
            ], [
              new Error('Third error')
            ]
          ];

          emitter.error(function(err) {
            expect(err).to.equal(errors);

            done();
          });
          emitter.emit('error', errors);
        });
      });
    });
  });
});
